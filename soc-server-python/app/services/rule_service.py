# ==============================================================================
# app/services/rule_service.py - Detection Rule Service
# Tương đương: internal/services/rule_service.go
# ==============================================================================

import json
import logging
import time
from typing import List, Optional, Dict, Any
from datetime import datetime

from sqlalchemy import select, delete, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rule import Rule
from app.rules.engine import global_rule_engine, RuleEngine

logger = logging.getLogger(__name__)


def default_rules() -> List[dict]:
    """
    Bộ Detection Rules toàn diện cho SOC/SOAR Platform.
    Bao phủ đầy đủ MITRE ATT&CK framework:
      - Initial Access, Execution, Persistence, Privilege Escalation
      - Defense Evasion, Credential Access, Discovery, Lateral Movement
      - Collection, Command & Control, Exfiltration, Impact

    Phân loại theo 5 nhóm chính:
      1. PROCESS / SYSMON (PS-, EXEC-, CRED-, LOLBIN-, LATMOV-)
      2. FIM - Linux  (FIM-100101 → FIM-100115)
      3. FIM - Windows (FIM-100201 → FIM-100215)
      4. FIM - Global  (FIM-100301 → FIM-100310)
      5. NETWORK / C2   (NET-)
    """
    return [
        # ======================================================================
        # ███ GROUP 1: PROCESS / SYSMON DETECTION RULES
        # ======================================================================

        # ---------- Execution ----------
        {
            "id": "PS-SUSPICIOUS-001",
            "name": "Phát hiện PowerShell thực thi lệnh mã hóa/tải file đáng ngờ",
            "severity": "high",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "process_name", "operator": "in", "value": "powershell.exe,pwsh.exe,powershell_ise.exe"},
                {"field": "command_line", "operator": "contains_any", "value": "-EncodedCommand,-enc ,Invoke-Expression,IEX,DownloadString,DownloadFile,Net.WebClient,Invoke-WebRequest,Start-BitsTransfer,-ExecutionPolicy Bypass,-ep bypass,-nop -w hidden"}
            ]),
            "mitre_tactic": "Execution",
            "mitre_technique_id": "T1059.001",
            "description": "Phát hiện PowerShell chạy tham số mã hóa hoặc tải script độc hại từ bên ngoài.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "EXEC-CMD-001",
            "name": "Phát hiện CMD thực thi lệnh tải payload / reverse shell",
            "severity": "high",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "process_name", "operator": "in", "value": "cmd.exe"},
                {"field": "command_line", "operator": "contains_any", "value": "certutil -urlcache,bitsadmin /transfer,curl -o,wget ,mshta http,regsvr32 /s /n /u /i:http,rundll32 javascript"}
            ]),
            "mitre_tactic": "Execution",
            "mitre_technique_id": "T1059.003",
            "description": "Phát hiện CMD sử dụng các Living-off-the-Land Binaries (LOLBins) để tải và thực thi payload.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "EXEC-SCRIPT-002",
            "name": "Phát hiện Windows Script Host thực thi script đáng ngờ",
            "severity": "high",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "process_name", "operator": "in", "value": "wscript.exe,cscript.exe,mshta.exe"},
                {"field": "command_line", "operator": "contains_any", "value": "http://,https://,.vbs,.js,.wsf,.hta,ActiveXObject,WScript.Shell"}
            ]),
            "mitre_tactic": "Execution",
            "mitre_technique_id": "T1059.005",
            "description": "Phát hiện script VBS/JS/HTA thực thi qua WSH - thường được dùng cho initial payload.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "EXEC-MACRO-003",
            "name": "Phát hiện Office Macro sinh tiến trình con đáng ngờ",
            "severity": "high",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "parent_process", "operator": "in", "value": "winword.exe,excel.exe,powerpnt.exe,outlook.exe"},
                {"field": "process_name", "operator": "in", "value": "cmd.exe,powershell.exe,wscript.exe,cscript.exe,mshta.exe,certutil.exe,regsvr32.exe"}
            ]),
            "mitre_tactic": "Execution",
            "mitre_technique_id": "T1204.002",
            "description": "Phát hiện tiến trình đáng ngờ được sinh ra từ ứng dụng Office - dấu hiệu chạy macro malware.",
            "is_active": True,
            "source": "database",
        },

        # ---------- Credential Access ----------
        {
            "id": "CRED-LSASS-001",
            "name": "Phát hiện truy cập LSASS Memory - Credential Dumping",
            "severity": "critical",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "command_line", "operator": "contains_any", "value": "lsass.dmp,procdump -ma lsass,mimikatz,sekurlsa::logonpasswords,comsvcs.dll MiniDump,rundll32 comsvcs.dll"}
            ]),
            "mitre_tactic": "Credential Access",
            "mitre_technique_id": "T1003.001",
            "description": "Phát hiện dump bộ nhớ LSASS - kỹ thuật trích xuất thông tin đăng nhập phổ biến nhất.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "CRED-SAM-002",
            "name": "Phát hiện trích xuất SAM / NTDS.dit Database",
            "severity": "critical",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "command_line", "operator": "contains_any", "value": "reg save HKLM\\SAM,reg save HKLM\\SYSTEM,reg save HKLM\\SECURITY,ntdsutil,secretsdump,vssadmin create shadow,ntds.dit"}
            ]),
            "mitre_tactic": "Credential Access",
            "mitre_technique_id": "T1003.002",
            "description": "Phát hiện trích xuất SAM registry hive hoặc AD database NTDS.dit.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "CRED-KERBEROAST-003",
            "name": "Phát hiện Kerberoasting / AS-REP Roasting",
            "severity": "high",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "command_line", "operator": "contains_any", "value": "Invoke-Kerberoast,Get-SPNUsers,Rubeus kerberoast,asreproast,GetUserSPNs,hashcat -m 13100,hashcat -m 18200"}
            ]),
            "mitre_tactic": "Credential Access",
            "mitre_technique_id": "T1558.003",
            "description": "Phát hiện Kerberoasting hoặc AS-REP Roasting - tấn công offline crack mật khẩu AD.",
            "is_active": True,
            "source": "database",
        },

        # ---------- Lateral Movement ----------
        {
            "id": "LATMOV-PSEXEC-001",
            "name": "Phát hiện PsExec / Remote Service Execution",
            "severity": "high",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "process_name", "operator": "in", "value": "psexec.exe,psexec64.exe,paexec.exe"},
            ]),
            "mitre_tactic": "Lateral Movement",
            "mitre_technique_id": "T1570",
            "description": "Phát hiện sử dụng PsExec hoặc PAExec - công cụ phổ biến để di chuyển ngang trong mạng.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "LATMOV-WMI-002",
            "name": "Phát hiện WMI Remote Execution",
            "severity": "high",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "process_name", "operator": "in", "value": "wmic.exe,wmiprvse.exe"},
                {"field": "command_line", "operator": "contains_any", "value": "process call create,/node:,wmiexec"}
            ]),
            "mitre_tactic": "Lateral Movement",
            "mitre_technique_id": "T1047",
            "description": "Phát hiện WMI được dùng để thực thi lệnh từ xa trên máy tính khác trong mạng.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "LATMOV-RDP-003",
            "name": "Phát hiện kích hoạt RDP từ dòng lệnh",
            "severity": "high",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "command_line", "operator": "contains_any", "value": "reg add.*TerminalServer.*fDenyTSConnections.*0,netsh advfirewall.*3389.*enable,Enable-NetFirewallRule.*RemoteDesktop"}
            ]),
            "mitre_tactic": "Lateral Movement",
            "mitre_technique_id": "T1021.001",
            "description": "Phát hiện hành vi kích hoạt Remote Desktop từ dòng lệnh - có thể là lateral movement.",
            "is_active": True,
            "source": "database",
        },

        # ---------- Defense Evasion ----------
        {
            "id": "LOLBIN-CERTUTIL-001",
            "name": "Phát hiện Certutil tải file / decode payload",
            "severity": "high",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "process_name", "operator": "in", "value": "certutil.exe"},
                {"field": "command_line", "operator": "contains_any", "value": "-urlcache,-decode,-decodehex,-encode,split"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1140",
            "description": "Phát hiện certutil.exe dùng để tải file hoặc decode payload mã hóa - LOLBin phổ biến.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "EVASION-LOG-CLEAR-001",
            "name": "Phát hiện xóa Windows Event Log",
            "severity": "critical",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "command_line", "operator": "contains_any", "value": "wevtutil cl,Clear-EventLog,Remove-EventLog,del /q.*\\Windows\\System32\\winevt\\Logs"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1070.001",
            "description": "Phát hiện hành vi xóa nhật ký sự kiện Windows - dấu hiệu phi tang chứng cứ tấn công.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "EVASION-DISABLE-AV-002",
            "name": "Phát hiện vô hiệu hóa Windows Defender / Antivirus",
            "severity": "critical",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "command_line", "operator": "contains_any", "value": "Set-MpPreference -DisableRealtimeMonitoring,DisableAntiSpyware,sc stop WinDefend,sc stop MpsSvc,net stop WinDefend,DisableBehaviorMonitoring"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1562.001",
            "description": "Phát hiện hành vi tắt Windows Defender hoặc dịch vụ Antivirus - dọn đường cho malware.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "EVASION-FIREWALL-003",
            "name": "Phát hiện vô hiệu hóa Windows Firewall",
            "severity": "high",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "command_line", "operator": "contains_any", "value": "netsh advfirewall set allprofiles state off,netsh firewall set opmode disable,Set-NetFirewallProfile -Enabled False"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1562.004",
            "description": "Phát hiện hành vi tắt Windows Firewall - thường xảy ra trước khi kết nối C2 hoặc lateral movement.",
            "is_active": True,
            "source": "database",
        },

        # ---------- Discovery ----------
        {
            "id": "DISC-RECON-001",
            "name": "Phát hiện Active Directory Reconnaissance",
            "severity": "medium",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "command_line", "operator": "contains_any", "value": "net user /domain,net group /domain,nltest /dclist,dsquery,ldapsearch,Get-ADUser,Get-ADComputer,Get-ADGroup,bloodhound,sharphound"}
            ]),
            "mitre_tactic": "Discovery",
            "mitre_technique_id": "T1087.002",
            "description": "Phát hiện hành vi liệt kê tài khoản và nhóm trong Active Directory.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "DISC-NETSCAN-002",
            "name": "Phát hiện Network Scanning / Port Scanning",
            "severity": "medium",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "command_line", "operator": "contains_any", "value": "nmap,masscan,Advanced IP Scanner,angry ip,Test-NetConnection,tnc -port,net view /all,arp -a,nbtscan"}
            ]),
            "mitre_tactic": "Discovery",
            "mitre_technique_id": "T1046",
            "description": "Phát hiện công cụ quét mạng/cổng - dấu hiệu reconnaissance sau khi xâm nhập.",
            "is_active": True,
            "source": "database",
        },

        # ---------- Persistence ----------
        {
            "id": "PERSIST-REG-001",
            "name": "Phát hiện thêm Registry Run Key (Auto-start)",
            "severity": "high",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "command_line", "operator": "contains_any", "value": "reg add.*\\CurrentVersion\\Run,reg add.*\\CurrentVersion\\RunOnce,reg add.*\\Windows\\CurrentVersion\\Policies\\Explorer\\Run"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1547.001",
            "description": "Phát hiện thêm giá trị vào Registry Run Key để tự khởi động cùng Windows.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "PERSIST-SCHTASK-002",
            "name": "Phát hiện tạo Scheduled Task từ dòng lệnh",
            "severity": "high",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "process_name", "operator": "in", "value": "schtasks.exe,at.exe"},
                {"field": "command_line", "operator": "contains_any", "value": "/create,/sc ,/tn ,/tr "}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1053.005",
            "description": "Phát hiện tạo Windows Scheduled Task từ CLI - kỹ thuật persistence phổ biến.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "PERSIST-SERVICE-003",
            "name": "Phát hiện tạo Service mới từ dòng lệnh",
            "severity": "high",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "command_line", "operator": "contains_any", "value": "sc create,sc config.*binpath,New-Service,Install-Service"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1543.003",
            "description": "Phát hiện tạo Windows Service mới từ CLI - có thể là cài đặt backdoor.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "PERSIST-ACCOUNT-004",
            "name": "Phát hiện tạo tài khoản Local Admin mới",
            "severity": "critical",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "command_line", "operator": "contains_any", "value": "net user /add,net localgroup administrators /add,Add-LocalGroupMember.*Administrators,New-LocalUser"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1136.001",
            "description": "Phát hiện tạo tài khoản Local Admin mới - dấu hiệu thiết lập backdoor tài khoản.",
            "is_active": True,
            "source": "database",
        },

        # ---------- Impact ----------
        {
            "id": "RANSOMWARE-VSS-001",
            "name": "Phát hiện xóa Volume Shadow Copy - Dấu hiệu Ransomware",
            "severity": "critical",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "process_name", "operator": "in", "value": "vssadmin.exe,wmic.exe,bcdedit.exe,wbadmin.exe"},
                {"field": "command_line", "operator": "contains_any", "value": "delete shadows,shadowcopy delete,recoveryenabled No,resize shadowstorage"}
            ]),
            "mitre_tactic": "Impact",
            "mitre_technique_id": "T1490",
            "description": "Cảnh báo hành vi cố tình xóa bản sao lưu phục hồi hệ thống của ransomware.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "IMPACT-BITLOCKER-002",
            "name": "Phát hiện BitLocker / Cipher Abuse - Ransomware Tactic",
            "severity": "critical",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "command_line", "operator": "contains_any", "value": "manage-bde -on,manage-bde -lock,cipher /w:,cipher /e /s:"}
            ]),
            "mitre_tactic": "Impact",
            "mitre_technique_id": "T1486",
            "description": "Phát hiện lạm dụng BitLocker hoặc Cipher.exe để mã hóa dữ liệu - chiến thuật ransomware.",
            "is_active": True,
            "source": "database",
        },

        # ---------- Linux Process Rules ----------
        {
            "id": "EXEC-LINUX-REVSHELL-001",
            "name": "Linux - Phát hiện Reverse Shell Command",
            "severity": "critical",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "command_line", "operator": "contains_any", "value": "bash -i >& /dev/tcp,nc -e /bin/bash,ncat -e,python -c 'import socket,perl -e 'use Socket,ruby -rsocket,php -r '$sock=fsockopen,socat exec:'bash'"}
            ]),
            "mitre_tactic": "Execution",
            "mitre_technique_id": "T1059.004",
            "description": "Phát hiện lệnh tạo reverse shell trên Linux - kết nối ngược về máy kẻ tấn công.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "PRIVESC-LINUX-SUDO-001",
            "name": "Linux - Phát hiện Sudo Privilege Escalation Abuse",
            "severity": "high",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "command_line", "operator": "contains_any", "value": "sudo -l,sudo su,sudo bash,sudo /bin/sh,pkexec,doas,CVE-2021-3156"}
            ]),
            "mitre_tactic": "Privilege Escalation",
            "mitre_technique_id": "T1548.003",
            "description": "Phát hiện hành vi lạm dụng sudo hoặc pkexec để leo thang quyền root trên Linux.",
            "is_active": True,
            "source": "database",
        },

        # ======================================================================
        # ███ GROUP 2: FIM - LINUX FILE INTEGRITY MONITORING
        # ======================================================================
        {
            "id": "FIM-100101",
            "name": "Linux - Critical Identity Database Modified",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/etc/passwd,/etc/shadow,/etc/group,/etc/gshadow"}
            ]),
            "mitre_tactic": "Initial Access",
            "mitre_technique_id": "T1078",
            "description": "Phát hiện sự thay đổi/thêm người dùng vào file quản lý tài khoản hệ thống Linux.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100102",
            "name": "Linux - Sudoers Privilege Escalation Tampering",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/etc/sudoers,/etc/sudoers.d"}
            ]),
            "mitre_tactic": "Privilege Escalation",
            "mitre_technique_id": "T1548.003",
            "description": "Phát hiện cấu hình cấp quyền Root (Sudoers) bị can thiệp trái phép.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100103",
            "name": "Linux - SSH Configuration or Keys Modified",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/etc/ssh/sshd_config,authorized_keys,id_rsa,id_ed25519,known_hosts"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1098.004",
            "description": "Phát hiện sửa cấu hình SSH daemon hoặc thêm SSH Public Key lạ để duy trì truy cập.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100104",
            "name": "Linux - Persistence Cron Job Created or Modified",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/etc/cron,/var/spool/cron,/etc/anacrontab"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1053.003",
            "description": "Phát hiện lịch chạy tự động (Cron job) mới được tạo hoặc chỉnh sửa.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100105",
            "name": "Linux - Persistence Systemd Service Unit Added/Modified",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/etc/systemd/system,/usr/lib/systemd/system,/lib/systemd/system"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1543.002",
            "description": "Phát hiện service hệ thống Linux mới được đăng ký để khởi động cùng OS.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100106",
            "name": "Linux - PAM Authentication Configuration Tampering",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/etc/pam.d,/etc/pam.conf,/lib/security"}
            ]),
            "mitre_tactic": "Credential Access",
            "mitre_technique_id": "T1556.003",
            "description": "Phát hiện can thiệp cấu hình PAM - có thể cài backdoor xác thực.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100107",
            "name": "Linux - SUID/SGID Bit Granted to File",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "perm", "operator": "contains_any", "value": "4000,2000"}
            ]),
            "mitre_tactic": "Privilege Escalation",
            "mitre_technique_id": "T1548.001",
            "description": "Phát hiện gán quyền SUID/SGID cho file cho phép leo thang quyền root.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100108",
            "name": "Linux - Web Shell Dropped in Web Root",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/var/www/html,/var/www/cgi-bin,/srv/www,/usr/share/nginx/html"},
                {"field": "path", "operator": "contains_any", "value": ".php,.phtml,.phar,.jsp,.jspx,.asp,.aspx,.cgi"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1505.003",
            "description": "Phát hiện file mã độc Web Shell tạo mới trong thư mục nguồn Web Server.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100109",
            "name": "Linux - Executable Script Created in Temp Directory",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/tmp/,/var/tmp/,/dev/shm/"},
                {"field": "path", "operator": "contains_any", "value": ".sh,.py,.pl,.elf,.bin,.so"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1059.004",
            "description": "Phát hiện script/binary thực thi được thả vào thư mục tạm của hệ thống.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100110",
            "name": "Linux - Name Service Configuration Tampered",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/etc/resolv.conf,/etc/hosts,/etc/nsswitch.conf"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1565.001",
            "description": "Phát hiện thay đổi DNS/Hosts config - có thể là DNS hijacking hoặc man-in-the-middle.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100111",
            "name": "Linux - Firewall Rules Modified (iptables/nftables)",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/etc/iptables,/etc/nftables,/etc/firewalld,/etc/ufw,iptables.rules,nftables.conf"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1562.004",
            "description": "Phát hiện thay đổi cấu hình firewall Linux - có thể mở port cho C2.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100112",
            "name": "Linux - Kernel Module / Driver Loading Configuration Changed",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/etc/modules,/etc/modprobe.d,/lib/modules,.ko"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1547.006",
            "description": "Phát hiện thay đổi cấu hình kernel module - có thể cài rootkit kernel-level.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100113",
            "name": "Linux - LD_PRELOAD / Dynamic Linker Hijack",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/etc/ld.so.preload,/etc/ld.so.conf,ld.so.conf.d"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1574.006",
            "description": "Phát hiện thay đổi dynamic linker config - kỹ thuật hijack shared library.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100114",
            "name": "Linux - Shell Profile / RC File Backdoor",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": ".bashrc,.bash_profile,.profile,.zshrc,/etc/profile,/etc/bash.bashrc,/etc/environment"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1546.004",
            "description": "Phát hiện chỉnh sửa shell profile - có thể cài backdoor chạy mỗi khi user đăng nhập.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100115",
            "name": "Linux - Package Manager Repository Tampering",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/etc/apt/sources.list,/etc/yum.repos.d,/etc/dnf,/etc/pacman.conf"}
            ]),
            "mitre_tactic": "Initial Access",
            "mitre_technique_id": "T1195.002",
            "description": "Phát hiện thay đổi repository nguồn gói - có thể là supply chain attack.",
            "is_active": True,
            "source": "database",
        },

        # ======================================================================
        # ███ GROUP 3: FIM - WINDOWS FILE INTEGRITY MONITORING
        # ======================================================================
        {
            "id": "FIM-100201",
            "name": "Windows - System32 Executable / DLL Modification",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "System32,SysWOW64"},
                {"field": "path", "operator": "contains_any", "value": ".exe,.dll,.sys"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1036",
            "description": "Phát hiện can thiệp chỉnh sửa/ghi đè file hệ thống cốt lõi Windows System32.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100202",
            "name": "Windows - Scheduled Task File Created / Modified",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains", "value": "System32\\Tasks"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1053.005",
            "description": "Phát hiện file cấu hình Windows Scheduled Task mới được tạo hoặc chỉnh sửa.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100203",
            "name": "Windows - Startup Folder Modification",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains", "value": "Start Menu\\Programs\\Startup"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1547.001",
            "description": "Phát hiện shortcut hoặc file thực thi thả vào thư mục Startup khởi động cùng Windows.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100204",
            "name": "Windows - HOSTS File Modified (DNS Hijack)",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains", "value": "drivers\\etc\\hosts"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1565.001",
            "description": "Phát hiện sửa file HOSTS - kỹ thuật redirect DNS để chặn cập nhật AV hoặc tấn công MitM.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100205",
            "name": "Windows - Group Policy Object (GPO) Tampered",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "\\Group Policy\\,\\GroupPolicy\\,Registry.pol,GptTmpl.inf"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1484.001",
            "description": "Phát hiện chỉnh sửa Group Policy Object - có thể dùng để push malware toàn domain.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100206",
            "name": "Windows - PowerShell Profile Backdoor",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "WindowsPowerShell\\profile.ps1,PowerShell\\profile.ps1,Microsoft.PowerShell_profile.ps1"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1546.013",
            "description": "Phát hiện chỉnh sửa PowerShell profile - chạy code độc mỗi khi mở PowerShell.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100207",
            "name": "Windows - WMI Event Subscription Persistence",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "\\WBEM\\Repository\\,OBJECTS.DATA,MAPPING.VER"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1546.003",
            "description": "Phát hiện thay đổi WMI Repository - có thể cài persistence fileless qua WMI Event.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100208",
            "name": "Windows - DLL Side-Loading in System Directories",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "action", "operator": "equals", "value": "created"},
                {"field": "path", "operator": "contains_any", "value": "Program Files,ProgramData,AppData\\Roaming"},
                {"field": "path", "operator": "contains", "value": ".dll"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1574.001",
            "description": "Phát hiện DLL mới được tạo trong thư mục ứng dụng - có thể là DLL side-loading attack.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100209",
            "name": "Windows - Certificate Store Modification",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "\\Microsoft\\SystemCertificates\\,\\Microsoft\\Crypto\\,\\Microsoft\\EnterpriseCertificates\\"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1553.004",
            "description": "Phát hiện thay đổi kho chứng chỉ Windows - có thể cài root CA giả mạo.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100210",
            "name": "Windows - Boot Configuration Data Modified",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "\\BCD,\\bootmgr,boot.ini,\\EFI\\Microsoft\\Boot"}
            ]),
            "mitre_tactic": "Impact",
            "mitre_technique_id": "T1542.003",
            "description": "Phát hiện thay đổi Boot Configuration Data - có thể là bootkit hoặc ransomware.",
            "is_active": True,
            "source": "database",
        },

        # ======================================================================
        # ███ GROUP 4: FIM - GLOBAL / CROSS-PLATFORM
        # ======================================================================
        {
            "id": "FIM-100301",
            "name": "Global - Security Agent Configuration Tampering",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "ossec.conf,wazuh-agent.conf,soc-agent,config.json"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1562.001",
            "description": "Phát hiện file cấu hình agent giám sát an ninh bị can thiệp/vô hiệu hóa.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100302",
            "name": "Global - SSL/TLS Certificate or Private Key Modified",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": ".pem,.crt,.cer,.key,.p12,.pfx,.jks,/etc/ssl/,/etc/pki/"}
            ]),
            "mitre_tactic": "Credential Access",
            "mitre_technique_id": "T1552.004",
            "description": "Phát hiện thay đổi/thêm certificate hoặc private key - có thể bị đánh cắp hoặc thay thế.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100303",
            "name": "Global - Ransomware Note Detected",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "readme_decrypt,how_to_decrypt,DECRYPT_FILES,.LOCKED,.crypted,.encrypted,.locky,.cerber,.zepto,.crypt,.pay2key"}
            ]),
            "mitre_tactic": "Impact",
            "mitre_technique_id": "T1486",
            "description": "Phát hiện file thông báo tống tiền (Ransom note) hoặc đuôi file bị mã hóa.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100304",
            "name": "Global - Database Configuration File Modified",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "my.cnf,my.ini,postgresql.conf,pg_hba.conf,mongod.conf,redis.conf,.env"}
            ]),
            "mitre_tactic": "Collection",
            "mitre_technique_id": "T1005",
            "description": "Phát hiện sửa đổi cấu hình database - có thể thay đổi xác thực hoặc bind address.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100305",
            "name": "Global - Docker / Container Configuration Tampered",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "docker-compose.yml,Dockerfile,daemon.json,/var/run/docker.sock,/etc/docker/"}
            ]),
            "mitre_tactic": "Execution",
            "mitre_technique_id": "T1610",
            "description": "Phát hiện thay đổi cấu hình Docker - có thể triển khai container độc hại.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100306",
            "name": "Global - Log File Deletion Detected (Anti-Forensics)",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "action", "operator": "equals", "value": "deleted"},
                {"field": "path", "operator": "contains_any", "value": ".log,/var/log/,syslog,auth.log,secure,messages,wtmp,btmp,lastlog,audit.log"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1070.002",
            "description": "Phát hiện xóa file nhật ký - dấu hiệu kẻ tấn công phi tang chứng cứ.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100307",
            "name": "Global - Executable Created in Non-Standard Location",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "action", "operator": "equals", "value": "created"},
                {"field": "path", "operator": "contains_any", "value": ".exe,.msi,.bat,.cmd,.ps1,.vbs,.js,.hta,.scr,.com,.pif"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1036.005",
            "description": "Phát hiện file thực thi mới tạo - có thể là malware dropper hoặc payload.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100308",
            "name": "Global - Archive/Compressed File with Password Protection",
            "severity": "medium",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "action", "operator": "equals", "value": "created"},
                {"field": "path", "operator": "contains_any", "value": ".zip,.7z,.rar,.tar.gz,.gz,.bz2,.xz"}
            ]),
            "mitre_tactic": "Exfiltration",
            "mitre_technique_id": "T1560.001",
            "description": "Phát hiện tạo file nén mới - có thể là giai đoạn chuẩn bị exfiltration dữ liệu.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100309",
            "name": "Global - Cryptocurrency Miner Configuration Detected",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "xmrig,config_miner,stratum+tcp,pool.minexmr,coinhive,cryptonight"}
            ]),
            "mitre_tactic": "Impact",
            "mitre_technique_id": "T1496",
            "description": "Phát hiện file cấu hình cryptocurrency miner - tấn công cryptojacking.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100310",
            "name": "Global - Sensitive Credentials File Access",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": ".kdbx,.keychain,credentials.xml,web.config,wp-config.php,settings.py,application.properties,.git-credentials,.netrc"}
            ]),
            "mitre_tactic": "Credential Access",
            "mitre_technique_id": "T1552.001",
            "description": "Phát hiện truy cập/sửa file chứa thông tin đăng nhập nhạy cảm.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-DOWNLOAD-SUSP-001",
            "name": "Phát hiện file thực thi mới được tải về (Downloads Monitor)",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "action", "operator": "equals", "value": "created"},
                {"field": "path", "operator": "contains_any", "value": "Downloads,temp,.exe,.bat,.ps1,.vbs,.iso,.msi,.scr,.hta"}
            ]),
            "mitre_tactic": "Initial Access",
            "mitre_technique_id": "T1566",
            "description": "Phát hiện các file có khả năng chứa mã độc thực thi được tải về thư mục Downloads.",
            "is_active": True,
            "source": "database",
        },

        # ======================================================================
        # ███ GROUP 5: NETWORK / COMMAND & CONTROL DETECTION
        # ======================================================================
        {
            "id": "NET-C2-BEACON-001",
            "name": "Phát hiện Cobalt Strike / C2 Beacon Indicators",
            "severity": "critical",
            "event_type": "network_anomaly",
            "conditions": json.dumps([
                {"field": "process_name", "operator": "contains_any", "value": "beacon,cobaltstrike,cobalt"},
            ]),
            "mitre_tactic": "Command and Control",
            "mitre_technique_id": "T1071.001",
            "description": "Phát hiện indicators liên quan đến Cobalt Strike C2 framework.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "NET-DNS-TUNNEL-002",
            "name": "Phát hiện DNS Tunneling / Data Exfiltration qua DNS",
            "severity": "high",
            "event_type": "network_anomaly",
            "conditions": json.dumps([
                {"field": "process_name", "operator": "contains_any", "value": "iodine,dnscat,dns2tcp,dnstunnel"},
            ]),
            "mitre_tactic": "Exfiltration",
            "mitre_technique_id": "T1048.003",
            "description": "Phát hiện công cụ DNS tunneling - kỹ thuật exfiltration dữ liệu qua DNS queries.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "NET-TOR-PROXY-003",
            "name": "Phát hiện kết nối TOR / Anonymization Proxy",
            "severity": "high",
            "event_type": "network_anomaly",
            "conditions": json.dumps([
                {"field": "command_line", "operator": "contains_any", "value": "tor.exe,tor ,socks5://127.0.0.1:9050,proxychains"},
            ]),
            "mitre_tactic": "Command and Control",
            "mitre_technique_id": "T1090.003",
            "description": "Phát hiện sử dụng TOR hoặc proxy ẩn danh - thường dùng để che giấu C2 traffic.",
            "is_active": True,
            "source": "database",
        },
    ]


class RuleService:
    def __init__(self, db: AsyncSession, engine: RuleEngine = global_rule_engine):
        self.db = db
        self.engine = engine

    async def get_all_rules(self) -> List[Rule]:
        """Lấy toàn bộ danh sách rules chưa bị xóa từ Database"""
        stmt = select(Rule).where(Rule.deleted_at.is_(None)).order_by(desc(Rule.created_at))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_rule(self, data: Dict[str, Any]) -> Rule:
        """Thêm Rule mới vào database và Hot-reload Engine"""
        raw_id = (data.get("id") or "").strip()
        rule_id = raw_id if raw_id else f"RULE-{int(time.time() * 1000)}"
        rule_name = (data.get("name") or "Unnamed Rule").strip()

        # Validate JSON conditions
        conditions_str = data.get("conditions", "[]")
        if not isinstance(conditions_str, str):
            conditions_str = json.dumps(conditions_str)
        else:
            try:
                json.loads(conditions_str)
            except Exception:
                raise ValueError("conditions không phải là JSON hợp lệ")

        rule = Rule(
            id=rule_id,
            name=rule_name,
            severity=data.get("severity", "medium"),
            event_type=data.get("event_type", "process_creation"),
            conditions=conditions_str,
            mitre_tactic=data.get("mitre_tactic", ""),
            mitre_technique_id=data.get("mitre_technique_id", ""),
            description=data.get("description", ""),
            is_active=data.get("is_active", True),
            source=data.get("source", "database"),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        self.db.add(rule)
        await self.db.commit()
        await self.db.refresh(rule)

        logger.info(f"[RULE SERVICE] Đã tạo Rule mới '{rule.id}'. Kích hoạt hot-reload...")
        await self.engine.load_all_rules(self.db)
        return rule

    async def _find_rule(self, rule_id: str) -> Optional[Rule]:
        """Tìm rule theo id chính xác, hoặc trim whitespace, hoặc theo name"""
        clean_id = rule_id.strip()
        stmt = select(Rule).where(
            (Rule.id == rule_id) |
            (func.trim(Rule.id) == clean_id) |
            (Rule.name == rule_id) |
            (func.trim(Rule.name) == clean_id)
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def update_rule(self, rule_id: str, data: Dict[str, Any]) -> Rule:
        """Cập nhật Rule trong DB và hot-reload"""
        rule = await self._find_rule(rule_id)

        conditions_str = data.get("conditions")
        if conditions_str is not None:
            if not isinstance(conditions_str, str):
                conditions_str = json.dumps(conditions_str)
            else:
                try:
                    json.loads(conditions_str)
                except Exception:
                    raise ValueError("conditions không phải là JSON hợp lệ")

        if not rule:
            clean_id = (rule_id or "").strip() or f"RULE-{int(time.time() * 1000)}"
            rule = Rule(
                id=clean_id,
                name=(data.get("name") or "Unnamed Rule").strip(),
                severity=data.get("severity", "medium"),
                event_type=data.get("event_type", "process_creation"),
                conditions=conditions_str or "[]",
                mitre_tactic=data.get("mitre_tactic", ""),
                mitre_technique_id=data.get("mitre_technique_id", ""),
                description=data.get("description", ""),
                is_active=data.get("is_active", True),
                source=data.get("source", "database"),
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            self.db.add(rule)
        else:
            for field in ["name", "severity", "event_type", "mitre_tactic", "mitre_technique_id", "description", "is_active", "source"]:
                if field in data and data[field] is not None:
                    val = data[field]
                    if field in ["name", "id"] and isinstance(val, str):
                        val = val.strip()
                    setattr(rule, field, val)
            if conditions_str is not None:
                rule.conditions = conditions_str
            rule.updated_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(rule)
        logger.info(f"[RULE SERVICE] Đã cập nhật Rule '{rule.id}'. Kích hoạt hot-reload...")
        await self.engine.load_all_rules(self.db)
        return rule

    async def toggle_rule(self, rule_id: str, is_active: bool) -> bool:
        """Bật/tắt 1 Rule trong DB và hot-reload"""
        rule = await self._find_rule(rule_id)
        if not rule:
            return False

        rule.is_active = is_active
        rule.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.engine.load_all_rules(self.db)
        return True

    async def delete_rule(self, rule_id: str) -> bool:
        """Xóa 1 Rule khỏi DB và hot-reload (hỗ trợ cả tìm kiếm khoảng trắng)"""
        rule = await self._find_rule(rule_id)
        if not rule:
            return False

        await self.db.delete(rule)
        await self.db.commit()
        logger.info(f"[RULE SERVICE] Đã xóa vĩnh viễn Rule '{rule.id}'. Kích hoạt hot-reload...")
        await self.engine.load_all_rules(self.db)
        return True
