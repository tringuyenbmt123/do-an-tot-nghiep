import time
from threading import Thread
from collections import defaultdict, deque
import logging
import socket
import requests  # Để gửi HTTP POST về server
from scapy.all import sniff, IP, TCP, UDP, ICMP
import pandas as pd
import numpy as np
import os
import psutil
from utils import get_default_interface, logger  # Copy utils.py từ server

class ClientTrafficAnalyzer:
    EMA_ALPHA = 0.5
    FLOW_HISTORY_LEN = 5
    FLOW_FREQ_WINDOW = 10
    MIN_DURATION = 1.0

    def __init__(self, interface=None, window_size=1,
                 server_url="http://192.168.91.136:5000/api/receive_flow",
                 agent_id="endpoint-unknown"):  # SOC integration — agent_id identifies this endpoint
        self.interface = interface or get_default_interface()
        self.window_size = max(0.2, float(window_size))
        self.flows = defaultdict(list)
        self.start_time = time.time()
        self.running = True
        self.local_ip = self._get_ipv4_of_interface(self.interface)
        self.server_url = server_url  # URL endpoint của server, thay bằng IP thực
        self.agent_id = agent_id      # SOC integration — unique ID for this agent/endpoint machine
        self.hostname = socket.gethostname()  # SOC integration — machine hostname for tagging
        self.flow_stats = defaultdict(lambda: {"ema_pps": 0.0, "ema_bps": 0.0})
        self.flow_history = defaultdict(lambda: {"packets": deque(maxlen=self.FLOW_HISTORY_LEN),
                                                 "bytes": deque(maxlen=self.FLOW_HISTORY_LEN)})
        self.src_ip_flow_count = defaultdict(lambda: {"count": 0, "last_time": time.time()})
        self.src_ip_packet_count = defaultdict(int)
        logger.info(f"Client initialized on interface: {self.interface} | Local IP: {self.local_ip} | Server: {self.server_url} | AgentID: {self.agent_id}")
        self._check_server_connectivity()  # SOC integration — verify server is reachable on startup

    def _check_server_connectivity(self):  # SOC integration
        """SOC integration — ping the DDoS Server health endpoint to verify connectivity."""
        health_url = self.server_url.replace('/api/receive_flow', '/api/receive_flow/health')  # SOC integration
        try:  # SOC integration
            resp = requests.get(health_url, timeout=5)  # SOC integration
            if resp.ok:  # SOC integration
                data = resp.json()  # SOC integration
                logger.info(f"SOC integration: DDoS Server reachable at {health_url} | analyzer_ready={data.get('analyzer_ready')}")  # SOC integration
            else:  # SOC integration
                logger.warning(f"SOC integration: DDoS Server health check returned {resp.status_code}")  # SOC integration
        except Exception as e:  # SOC integration
            logger.warning(f"SOC integration: Could not reach DDoS Server at {health_url}: {e}")  # SOC integration

    def _get_ipv4_of_interface(self, name: str) -> str:
        try:
            for addr in psutil.net_if_addrs().get(name, []):
                if addr.family == socket.AF_INET and not addr.address.startswith("127."):
                    return addr.address
        except Exception:
            pass
        return "127.0.0.1"

    def packet_callback(self, packet):
        try:
            if not self.running or IP not in packet:
                return
            src_ip = packet[IP].src
            dst_ip = packet[IP].dst
            proto = 'Other'
            if TCP in packet: proto = 'TCP'
            elif UDP in packet: proto = 'UDP'
            elif ICMP in packet: proto = 'ICMP'
            src_port = (packet[TCP].sport if TCP in packet else packet[UDP].sport if UDP in packet else 0)
            dst_port = (packet[TCP].dport if TCP in packet else packet[UDP].dport if UDP in packet else 0)
            flow_id = f"{src_ip}:{src_port}-{dst_ip}:{dst_port}-{proto}"
            pkt_len = int(len(packet))
            ip_hl = (packet[IP].ihl * 4) if IP in packet else 20
            tcp_hl = (packet[TCP].dataofs * 4) if TCP in packet else 0
            flags = int(packet[TCP].flags) if TCP in packet else 0
            ttl = int(packet[IP].ttl) if IP in packet else 0
            pkt_data = {
                'timestamp': time.time(),
                'src_ip': src_ip,
                'dst_ip': dst_ip,
                'packet_length': pkt_len,
                'ip_header_len': ip_hl,
                'tcp_header_len': tcp_hl,
                'ttl': ttl,
                'flags': flags,
                'src_port': src_port,
                'dst_port': dst_port,
                'is_http': int(src_port == 80 or dst_port == 80),
                'is_https': int(src_port == 443 or dst_port == 443),
                'protocol': proto,
            }
            self.flows[flow_id].append(pkt_data)
            self.src_ip_packet_count[src_ip] += 1
            if len(self.flows[flow_id]) >= 60 or (time.time() - self.start_time >= self.window_size):
                self._process_and_send_flow(flow_id)
                self.start_time = time.time()
        except Exception as e:
            logger.error(f"Error in packet_callback: {e}", exc_info=True)

    def _process_and_send_flow(self, flow_id):
        if flow_id not in self.flows:
            return
        features_by_flow = self.extract_features_by_flow(flow_id)
        if features_by_flow:
            self._send_to_server(features_by_flow)
        del self.flows[flow_id]

    @staticmethod
    def _flag_counts(flags_list):
        fin = sum(1 for f in flags_list if f & 0x01)
        syn = sum(1 for f in flags_list if f & 0x02)
        rst = sum(1 for f in flags_list if f & 0x04)
        psh = sum(1 for f in flags_list if f & 0x08)
        ack = sum(1 for f in flags_list if f & 0x10)
        return fin, syn, rst, psh, ack

    def extract_features_by_flow(self, flow_id):
        features_by_flow = {}
        packets = self.flows[flow_id]
        if not packets:
            return features_by_flow
        src_ip = packets[0]['src_ip']
        dst_ip = packets[0]['dst_ip']
        proto = packets[0]['protocol']
        total_packets = len(packets)
        ts = [p['timestamp'] for p in packets]
        packet_sizes = [p['packet_length'] for p in packets]
        ttl_values = [p['ttl'] for p in packets]
        header_lengths = [p['ip_header_len'] + p['tcp_header_len'] for p in packets]
        flags_list = [p['flags'] for p in packets]
        fin_count, syn_count, rst_count, psh_count, ack_count = self._flag_counts(flags_list)
        tot_size = sum(packet_sizes)
        duration = max(ts) - min(ts) if len(ts) > 1 else self.MIN_DURATION
        duration = max(duration, self.MIN_DURATION)
        flow_pps = total_packets / duration
        flow_bps = tot_size / duration
        flow_stats = self.flow_stats[flow_id]
        flow_stats["ema_pps"] = flow_pps * self.EMA_ALPHA + (1 - self.EMA_ALPHA) * flow_stats["ema_pps"]
        flow_stats["ema_bps"] = flow_bps * self.EMA_ALPHA + (1 - self.EMA_ALPHA) * flow_stats["ema_bps"]
        history = self.flow_history[flow_id]
        history["packets"].append(total_packets)
        history["bytes"].append(tot_size)
        def ratio(count): return count / total_packets if total_packets else 0.0
        feature = {
            'flow id': flow_id,
            'source ip': src_ip,
            'destination ip': dst_ip,
            'Protocol Type': proto,
            'Header_Length': np.mean(header_lengths),
            'Time_To_Live': np.mean(ttl_values),
            'Rate': flow_stats["ema_pps"],
            'fin_flag_number': ratio(fin_count),
            'syn_flag_number': ratio(syn_count),
            'rst_flag_number': ratio(rst_count),
            'psh_flag_number': ratio(psh_count),
            'ack_flag_number': ratio(ack_count),
            'ack_count': ack_count,
            'syn_count': syn_count,
            'fin_count': fin_count,
            'rst_count': rst_count,
            'HTTP': int(any(p.get('is_http', 0) for p in packets)),
            'HTTPS': int(any(p.get('is_https', 0) for p in packets)),
            'DNS': int(any(p['src_port'] == 53 or p['dst_port'] == 53 for p in packets)),
            'Telnet': int(any(p['src_port'] == 23 or p['dst_port'] == 23 for p in packets)),
            'SSH': int(any(p['src_port'] == 22 or p['dst_port'] == 22 for p in packets)),
            'TCP': int(proto == 'TCP'),
            'UDP': int(proto == 'UDP'),
            'ICMP': int(proto == 'ICMP'),
            'Tot sum': sum(packet_sizes),
            'Min': min(packet_sizes),
            'Max': max(packet_sizes),
            'AVG': (tot_size / total_packets) if total_packets else 0.0,
            'Std': float(np.std(packet_sizes)) if len(packet_sizes) > 1 else 0.0,
            'Tot size': tot_size,
            'IAT': float(np.mean(np.diff(ts))) if len(ts) > 1 else 0.0,
            'Number': total_packets,
            'Variance': float(np.var(packet_sizes)) if len(packet_sizes) > 1 else 0.0,
            'flow packets/s': float(flow_stats["ema_pps"]),
            'flow bytes/s': float(flow_stats["ema_bps"]),
            'attack_type': None
        }
        features_by_flow[flow_id] = feature
        now = time.time()
        if now - self.src_ip_flow_count[src_ip]["last_time"] > self.FLOW_FREQ_WINDOW:
            self.src_ip_flow_count[src_ip] = {"count": 0, "last_time": now}
        self.src_ip_flow_count[src_ip]["count"] += 1
        return features_by_flow

    def _send_to_server(self, features_by_flow):
        try:
            # SOC integration — wrap flows with agent metadata so DDoS Server can tag the alert
            payload = {  # SOC integration
                "agent_id": self.agent_id,        # SOC integration
                "hostname": self.hostname,         # SOC integration
                "flows": features_by_flow,         # SOC integration
            }  # SOC integration
            response = requests.post(self.server_url, json=payload)
            if response.status_code == 200:
                logger.info(f"Sent {len(features_by_flow)} flow(s) to server: agent={self.agent_id}")
            else:
                logger.error(f"Failed to send to server: {response.text}")
        except Exception as e:
            logger.error(f"Error sending to server: {e}")

    def start_capture(self):
        bpf_filter = f"dst host {self.local_ip}"
        logger.info(f"Starting capture on {self.interface} filter: {bpf_filter}")
        sniff(iface=self.interface, prn=self.packet_callback, filter=bpf_filter, store=0, stop_filter=lambda _: not self.running)

def run_client_analyzer(analyzer):
    analyzer.start_capture()

if __name__ == "__main__":
    import argparse  # SOC integration
    parser = argparse.ArgumentParser(
        description="DDoS Sensor Client Analyzer — SOC Agent Mode"
    )
    parser.add_argument(
        "--server",
        default="http://192.168.91.136:5000/api/receive_flow",
        help="URL của DDoS Server endpoint (ví dụ: http://10.251.46.150:5000/api/receive_flow)"
    )  # SOC integration
    parser.add_argument(
        "--agent-id",
        default="endpoint-unknown",
        dest="agent_id",
        help="Agent ID duy nhất để nhận biết endpoint (ví dụ: endpoint-win11-01)"
    )  # SOC integration
    parser.add_argument(
        "--interface",
        default=None,
        help="Tên network interface để sniff (mặc định: tự phát hiện)"
    )  # SOC integration
    parser.add_argument(
        "--window",
        type=float,
        default=1.0,
        help="Kích thước cửa sổ thời gian tính flow (giây)"
    )  # SOC integration
    args = parser.parse_args()  # SOC integration

    logger.info(
        f"SOC integration: Starting client_analyzer | "
        f"agent_id={args.agent_id} | server={args.server} | "
        f"interface={args.interface or 'auto'} | window={args.window}s"
    )  # SOC integration

    analyzer = ClientTrafficAnalyzer(
        interface=args.interface,
        window_size=args.window,
        server_url=args.server,
        agent_id=args.agent_id,  # SOC integration
    )
    run_client_analyzer(analyzer)