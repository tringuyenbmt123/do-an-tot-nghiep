import sys
sys.path.insert(0, ".")
from process_monitor import ProcessMonitor
class FakeCfg:
    process_poll_interval_seconds = 1
    process_exclude_names = []
pm = ProcessMonitor(FakeCfg(), None)
tests = [
    ("vssadmin.exe",   "C:\\Windows\\System32\\vssadmin.exe"),
    ("powershell.exe", "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"),
    ("wevtutil.exe",   "C:\\Windows\\System32\\wevtutil.exe"),
    ("cmd.exe",        "C:\\Windows\\System32\\cmd.exe"),
    ("svchost.exe",    "C:\\Windows\\System32\\svchost.exe"),
    ("explorer.exe",   "C:\\Windows\\explorer.exe"),
]
for name, exe in tests:
    r = pm._is_suspicious(name, exe, "")
    print(name, "-> SEND" if r else "-> SKIP")
