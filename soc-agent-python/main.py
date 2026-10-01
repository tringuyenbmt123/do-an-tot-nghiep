# ==============================================================================
# SOC/EDR Agent - Python Port
# File: main.py
# Mô tả: Endpoint Detection & Response (EDR) Agent viết bằng Python:
#         - gRPC Bidirectional Streaming (StreamEvents) + Heartbeat
#         - Real-time System Metrics Collector (psutil)
#         - Event-Driven Log Tailer (watchdog)
#         - File Integrity Monitoring (watchdog)
#         - Process Monitor & Network Monitor
#         - Active Response Command Execution
#         - Memory Buffer với Backpressure Policy
# ==============================================================================

import argparse
import io
import logging
import os
import signal
import sys
import threading

BANNER = r"""
==============================================================================
   ____  ___   ____     _                    _
  / ___/ _ \ / ___|   / \   __ _  ___ _ __ | |_
  \___ \ | | | |     / _ \ / _` |/ _ \ '_ \| __|
   ___) | |_| | |___ / ___ \ (_| |  __/ | | | |_
  |____/\___/ \____/_/   \_\__, |\___|_| |_|\__|
                            |___/
  Unified SOC/EDR Endpoint Detection & Response Agent [Python Port]
==============================================================================
"""


def setup_logging(log_file: str = "agent.log"):
    """Cấu hình ghi log ra file agent.log đồng thời với Console."""
    log_dir = os.path.dirname(os.path.abspath(log_file))
    os.makedirs(log_dir, exist_ok=True)

    handlers = [logging.StreamHandler(sys.stdout)]
    try:
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        handlers.append(file_handler)
    except Exception as e:
        print(f"[WARN] Không thể tạo file log '{log_file}': {e}")

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(message)s",
        datefmt="%Y/%m/%d %H:%M:%S",
        handlers=handlers,
    )


def run_agent(cfg, stop_event: threading.Event):
    """Khởi chạy toàn bộ các tác vụ của Agent."""
    logger = logging.getLogger(__name__)

    logger.info("[AGENT] 📌 Agent ID: %s", cfg.agent_id)
    logger.info(
        "[AGENT] 💻 Hostname: %s (%s, IP: %s)", cfg.hostname, cfg.os_type, cfg.ip_address
    )
    logger.info(
        "[AGENT] 🌐 Target Server: %s (Protocol: %s)", cfg.server_url, cfg.protocol
    )
    logger.info(
        "[AGENT] ⏱️  Heartbeat: %ds | Metric Interval: %ds | Buffer: %d items",
        cfg.heartbeat_interval_seconds,
        cfg.metric_interval_seconds,
        cfg.buffer_size,
    )

    # 1. Khởi tạo In-Memory Buffer
    from buffer import EventBuffer
    event_buffer = EventBuffer(cfg.buffer_size)

    # 2. Khởi tạo Metric Collector
    from metric_collector import MetricCollector
    metric_collector = MetricCollector(cfg, event_buffer)

    # 3. Khởi tạo Command Executor
    from command_executor import CommandExecutor
    command_executor = CommandExecutor(cfg, metric_collector, event_buffer)

    # 4. Khởi tạo Log Tailer
    log_tailer = None
    if cfg.log_tailer_enabled:
        from log_tailer import LogTailer
        log_tailer = LogTailer(cfg, event_buffer)

    # 5. Khởi tạo gRPC Streamer
    from grpc_streamer import GRPCStreamer
    grpc_streamer = GRPCStreamer(cfg, event_buffer, command_executor, metric_collector)

    # 6. Khởi chạy tất cả components trong threads riêng
    threads = []

    # Metric Collector
    if cfg.metrics_enabled:
        t = threading.Thread(
            target=metric_collector.start,
            args=(stop_event,),
            name="MetricCollector",
            daemon=True,
        )
        threads.append(t)
        t.start()

    # Log Tailer
    if cfg.log_tailer_enabled and log_tailer:
        t = threading.Thread(
            target=log_tailer.start,
            args=(stop_event,),
            name="LogTailer",
            daemon=True,
        )
        threads.append(t)
        t.start()

    # FIM Watcher
    if cfg.fim_enabled:
        from fim_watcher import FIMWatcher
        fim = FIMWatcher(cfg, event_buffer)
        t = threading.Thread(
            target=fim.start,
            args=(stop_event,),
            name="FIMWatcher",
            daemon=True,
        )
        threads.append(t)
        t.start()

    # Process Monitor
    if cfg.process_monitor_enabled:
        from process_monitor import ProcessMonitor
        proc_mon = ProcessMonitor(cfg, event_buffer)
        t = threading.Thread(
            target=proc_mon.start,
            args=(stop_event,),
            name="ProcessMonitor",
            daemon=True,
        )
        threads.append(t)
        t.start()

    # Network Monitor
    if cfg.network_monitor_enabled:
        from network_monitor import NetworkMonitor
        net_mon = NetworkMonitor(cfg, event_buffer)
        t = threading.Thread(
            target=net_mon.start,
            args=(stop_event,),
            name="NetworkMonitor",
            daemon=True,
        )
        threads.append(t)
        t.start()

    # gRPC Streamer (chạy trong thread riêng cũng được, nhưng giữ ở main thread để dễ join)
    grpc_thread = threading.Thread(
        target=grpc_streamer.start,
        args=(stop_event,),
        name="GRPCStreamer",
        daemon=True,
    )
    threads.append(grpc_thread)
    grpc_thread.start()

    logger.info("[AGENT] ✅ SOC/EDR Agent đang chạy đầy đủ tính năng...")

    # Chờ stop_event (từ Ctrl+C / SIGTERM)
    stop_event.wait()

    # Chờ tất cả threads hoàn tất dọn dẹp
    for t in threads:
        t.join(timeout=5)


def main():
    # Luôn đổi CWD về thư mục chứa main.py để đọc đúng config.json và ghi agent.log
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    parser = argparse.ArgumentParser(description="SOC/EDR Endpoint Agent (Python)")
    parser.add_argument(
        "-config", "--config",
        default="config.json",
        help="Đường dẫn tới file config.json",
    )
    args = parser.parse_args()

    setup_logging("agent.log")
    logger = logging.getLogger(__name__)

    print(BANNER)

    # Load cấu hình
    from agent_config import load_config
    cfg = load_config(args.config)

    # Stop event để graceful shutdown
    stop_event = threading.Event()

    def _shutdown_handler(signum, frame):
        logger.info("\n[AGENT] 🛑 Nhận tín hiệu tắt Agent. Đang tiến hành Graceful Shutdown...")
        stop_event.set()

    signal.signal(signal.SIGINT, _shutdown_handler)
    signal.signal(signal.SIGTERM, _shutdown_handler)

    try:
        run_agent(cfg, stop_event)
    except Exception as e:
        logger.error("[AGENT] ❌ Lỗi nghiêm trọng: %s", e, exc_info=True)

    logger.info("[AGENT] 👋 Agent đã dừng an toàn. Hẹn gặp lại!")


if __name__ == "__main__":
    main()
