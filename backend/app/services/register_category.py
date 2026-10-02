"""Where a register's value belongs on the device page.

- measurement: live process values (probes, pressures) - the first tile and
  the default chart series.
- setpoint: user-adjustable operating values (St, rd, alarm thresholds).
- parameter: configuration that rarely changes (timers, mode switches).
- status / alarm: on/off flags - shown as OK/AKTYWNY badges, never plotted.

A register's explicit `category` wins; otherwise it is derived from the
Modbus object type and the writable flag, which is right for every
built-in profile and for most hand-made ones.
"""

CATEGORIES = ("measurement", "setpoint", "parameter", "status", "alarm")
BINARY_TYPES = ("coil", "discrete_input")


def is_binary(reg) -> bool:
    """A 0/1 variable: a coil/discrete input, or one bit of a register."""
    return getattr(reg, "register_type", "holding") in BINARY_TYPES or getattr(reg, "bit", None) is not None


def register_category(reg) -> str:
    explicit = getattr(reg, "category", None)
    if explicit in CATEGORIES:
        return explicit
    if getattr(reg, "is_alarm_register", False):
        return "alarm"
    if getattr(reg, "register_type", "holding") in BINARY_TYPES or getattr(reg, "bit", None) is not None:
        return "status"
    if getattr(reg, "writable", False):
        return "setpoint"
    return "measurement"
