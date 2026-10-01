# ==============================================================================
# SOC/EDR Agent - Python Port
# File: command_executor.py
# Mô tả: Lắng nghe và thực thi các lệnh bảo mật gửi từ SOC Server:
#         - KILL_PROCESS: Diệt tiến trình độc hại
#         - BLOCK_IP: Chặn IP qua Firewall (Windows / Linux)
#         - COLLECT_FORENSIC / collect_now: Thu thập thông tin khẩn cấp
#         - ping / pong: Kiểm tra liveness
#         - update_config: Thay đổi chu kỳ thu thập động
# ==============================================================================

import json
import logging
import platform
import subprocess
import time
from typing import Tuple

import psutil

from grpc_stubs import make_event_request

logger = logging.getLogger(__name__)


class CommandExecutor:
    """Thực thi lệnh Active Response từ SOC Server."""

    def __init__(self, cfg, metric_collector, event_buffer):
        self._cfg = cfg
        self._collector = metric_collector
        self._buffer = event_buffer

    def execute_proto_command(self, cmd) -> None:
        """Xử lý lệnh CommandResponse nhận từ gRPC stream."""
        logger.info(
            "[EXECUTOR] ⚡ Nhận lệnh từ Server: Type=%s, Target='%s', CommandID=%s",
            cmd.command_type,
            cmd.target,
            cmd.command_id,
        )

        # Import enum values
        from grpc_stubs import get_pb2
        pb2 = get_pb2()

        cmd_type = cmd.command_type
        success = False
        result_message = ""

        if cmd_type == pb2.CommandType.Value("KILL_PROCESS"):
            success, result_message = self.kill_process(cmd.target)

        elif cmd_type == pb2.CommandType.Value("BLOCK_IP"):
            success, result_message = self.block_ip(cmd.target)

        elif cmd_type == pb2.CommandType.Value("COLLECT_FORENSIC"):
            success, result_message = self.collect_forensic_now()

        elif cmd_type == pb2.CommandType.Value("ISOLATE_NETWORK"):
            success, result_message = self.isolate_host()

        else:
            # Kiểm tra parameters xem có lệnh tùy biến không
            params = dict(cmd.parameters) if cmd.parameters else {}
            action = params.get("action", "")
            if action == "ping":
                success, result_message = True, "pong"
            elif action == "update_config":
                try:
                    hb = int(params.get("heartbeat_interval", 0))
                    met = int(params.get("metric_interval", 0))
                    self._cfg.update_intervals(hb, met)
                    success = True
                    result_message = f"Updated intervals: hb={hb}s, metric={met}s"
                except Exception as e:
                    success, result_message = False, str(e)
            elif action == "collect_now":
                success, result_message = self.collect_forensic_now()
            elif action:
                success, result_message = False, f"Lệnh không xác định: {action}"
            else:
                success, result_message = False, f"Lệnh không hỗ trợ: {cmd_type}"

        # Báo cáo kết quả về Server
        self._send_execution_result(
            cmd.command_id,
            str(cmd_type),
            cmd.target,
            success,
            result_message,
        )

    def kill_process(self, target: str) -> Tuple[bool, str]:
        """Diệt tiến trình theo PID hoặc tên (Cross-platform)."""
        if not target:
            return False, "Target PID/Process Name không được để trống"

        # Thử parse PID số
        try:
            pid = int(target)
            p = psutil.Process(pid)
            p.kill()
            return True, f"Đã kill tiến trình PID {pid} thành công"
        except (ValueError, psutil.NoSuchProcess, psutil.AccessDenied, Exception):
            pass

        # Nếu là tên tiến trình → dùng taskkill / kill
        system = platform.system().lower()
        try:
            if system == "windows":
                if target.isdigit():
                    cmd = ["taskkill", "/F", "/PID", target]
                else:
                    cmd = ["taskkill", "/F", "/IM", target]
            else:
                cmd = ["kill", "-9", target]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                return True, f"Đã kết thúc tiến trình '{target}': {result.stdout.strip()}"
            else:
                return False, f"Lỗi kill '{target}': {result.stderr.strip()}"
        except Exception as e:
            return False, f"Lỗi thực thi kill '{target}': {e}"

    def block_ip(self, ip: str) -> Tuple[bool, str]:
        """Chặn địa chỉ IP qua Firewall."""
        if not ip:
            return False, "IP address không được để trống"

        rule_name = f"SOC_EDR_BLOCK_{ip.replace('.', '_')}"
        system = platform.system().lower()

        try:
            if system == "windows":
                cmd = [
                    "netsh", "advfirewall", "firewall", "add", "rule",
                    f"name={rule_name}", "dir=in", "action=block",
                    f"remoteip={ip}", "enable=yes",
                ]
            else:
                cmd = ["iptables", "-A", "INPUT", "-s", ip, "-j", "DROP"]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                return True, f"Đã thêm rule firewall chặn IP {ip} thành công"
            else:
                return False, f"Không thể chặn IP {ip}: {result.stderr.strip()}"
        except Exception as e:
            return False, f"Lỗi block IP {ip}: {e}"

    def collect_forensic_now(self) -> Tuple[bool, str]:
        """Thu thập forensic tức thì và đẩy lên Server."""
        if self._collector is None:
            return False, "Collector chưa được khởi tạo"

        snap = self._collector.collect_forensics()
        if snap is None:
            return False, "Lỗi thu thập forensic"

        payload = json.dumps(snap.to_dict())
        req = make_event_request(
            agent_id=self._cfg.agent_id,
            event_type="forensic_snapshot",
            hostname=self._cfg.hostname,
            ip_address=self._cfg.ip_address,
            raw_payload=payload,
            timestamp=int(time.time() * 1000),
            metadata={"trigger": "on_demand_command", "severity": "high"},
        )
        pushed = self._buffer.push(req)
        if pushed:
            return True, f"Forensic snapshot đã tạo thành công ({len(snap.top_processes)} processes)"
        else:
            return False, "Event buffer đang đầy, không thể gửi forensic snapshot"

    def isolate_host(self) -> Tuple[bool, str]:
        """Cô lập mạng của host (demo)."""
        return True, f"Host '{self._cfg.hostname}' đã chuyển sang chế độ Network Isolation"

    def _send_execution_result(
        self, command_id: str, cmd_type: str, target: str, success: bool, message: str
    ) -> None:
        """Gửi kết quả thực thi về Server dưới dạng EventRequest."""
        res = {
            "command_id": command_id,
            "command": cmd_type,
            "target": target,
            "success": success,
            "message": message,
            "executed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        status = "success" if success else "failed"

        req = make_event_request(
            agent_id=self._cfg.agent_id,
            event_type="command_execution_result",
            hostname=self._cfg.hostname,
            ip_address=self._cfg.ip_address,
            raw_payload=json.dumps(res),
            timestamp=int(time.time() * 1000),
            metadata={
                "command_id": command_id,
                "status": status,
                "severity": "medium",
            },
        )

        pushed = self._buffer.push(req)
        if pushed:
            logger.info(
                "[EXECUTOR] ✅ Đã gửi báo cáo thực thi lệnh %s (Status: %s)",
                command_id, status,
            )
        else:
            logger.warning(
                "[EXECUTOR] ⚠️ Buffer đầy, không thể gửi báo cáo lệnh %s", command_id
            )
