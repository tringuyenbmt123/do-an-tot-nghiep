from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class CommandType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    COMMAND_NONE: _ClassVar[CommandType]
    KILL_PROCESS: _ClassVar[CommandType]
    BLOCK_IP: _ClassVar[CommandType]
    BLOCK_URL: _ClassVar[CommandType]
    QUARANTINE_FILE: _ClassVar[CommandType]
    COLLECT_FORENSIC: _ClassVar[CommandType]
    ISOLATE_NETWORK: _ClassVar[CommandType]
COMMAND_NONE: CommandType
KILL_PROCESS: CommandType
BLOCK_IP: CommandType
BLOCK_URL: CommandType
QUARANTINE_FILE: CommandType
COLLECT_FORENSIC: CommandType
ISOLATE_NETWORK: CommandType

class EventRequest(_message.Message):
    __slots__ = ("agent_id", "event_type", "hostname", "ip_address", "raw_payload", "timestamp", "metadata")
    class MetadataEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    AGENT_ID_FIELD_NUMBER: _ClassVar[int]
    EVENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    HOSTNAME_FIELD_NUMBER: _ClassVar[int]
    IP_ADDRESS_FIELD_NUMBER: _ClassVar[int]
    RAW_PAYLOAD_FIELD_NUMBER: _ClassVar[int]
    TIMESTAMP_FIELD_NUMBER: _ClassVar[int]
    METADATA_FIELD_NUMBER: _ClassVar[int]
    agent_id: str
    event_type: str
    hostname: str
    ip_address: str
    raw_payload: str
    timestamp: int
    metadata: _containers.ScalarMap[str, str]
    def __init__(self, agent_id: _Optional[str] = ..., event_type: _Optional[str] = ..., hostname: _Optional[str] = ..., ip_address: _Optional[str] = ..., raw_payload: _Optional[str] = ..., timestamp: _Optional[int] = ..., metadata: _Optional[_Mapping[str, str]] = ...) -> None: ...

class CommandResponse(_message.Message):
    __slots__ = ("command_id", "command_type", "target", "parameters", "timestamp")
    class ParametersEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    COMMAND_ID_FIELD_NUMBER: _ClassVar[int]
    COMMAND_TYPE_FIELD_NUMBER: _ClassVar[int]
    TARGET_FIELD_NUMBER: _ClassVar[int]
    PARAMETERS_FIELD_NUMBER: _ClassVar[int]
    TIMESTAMP_FIELD_NUMBER: _ClassVar[int]
    command_id: str
    command_type: CommandType
    target: str
    parameters: _containers.ScalarMap[str, str]
    timestamp: int
    def __init__(self, command_id: _Optional[str] = ..., command_type: _Optional[_Union[CommandType, str]] = ..., target: _Optional[str] = ..., parameters: _Optional[_Mapping[str, str]] = ..., timestamp: _Optional[int] = ...) -> None: ...

class HeartbeatRequest(_message.Message):
    __slots__ = ("agent_id", "hostname", "ip_address", "os_type", "agent_version", "cpu_usage", "memory_usage", "timestamp")
    AGENT_ID_FIELD_NUMBER: _ClassVar[int]
    HOSTNAME_FIELD_NUMBER: _ClassVar[int]
    IP_ADDRESS_FIELD_NUMBER: _ClassVar[int]
    OS_TYPE_FIELD_NUMBER: _ClassVar[int]
    AGENT_VERSION_FIELD_NUMBER: _ClassVar[int]
    CPU_USAGE_FIELD_NUMBER: _ClassVar[int]
    MEMORY_USAGE_FIELD_NUMBER: _ClassVar[int]
    TIMESTAMP_FIELD_NUMBER: _ClassVar[int]
    agent_id: str
    hostname: str
    ip_address: str
    os_type: str
    agent_version: str
    cpu_usage: float
    memory_usage: float
    timestamp: int
    def __init__(self, agent_id: _Optional[str] = ..., hostname: _Optional[str] = ..., ip_address: _Optional[str] = ..., os_type: _Optional[str] = ..., agent_version: _Optional[str] = ..., cpu_usage: _Optional[float] = ..., memory_usage: _Optional[float] = ..., timestamp: _Optional[int] = ...) -> None: ...

class HeartbeatResponse(_message.Message):
    __slots__ = ("acknowledged", "heartbeat_interval_seconds", "message")
    ACKNOWLEDGED_FIELD_NUMBER: _ClassVar[int]
    HEARTBEAT_INTERVAL_SECONDS_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    acknowledged: bool
    heartbeat_interval_seconds: int
    message: str
    def __init__(self, acknowledged: _Optional[bool] = ..., heartbeat_interval_seconds: _Optional[int] = ..., message: _Optional[str] = ...) -> None: ...
