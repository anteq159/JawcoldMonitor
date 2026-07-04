import asyncio
import random
import time
from app.core.config import settings

_start_time = time.time()


async def get_system_stats() -> dict:
    if settings.PREVIEW_MODE:
        return _mock_stats()
    return await _real_stats()


def _mock_stats() -> dict:
    t = time.time() - _start_time
    import math
    cpu = round(20 + 15 * abs(math.sin(t * 0.1)) + random.uniform(-2, 2), 1)
    temp = round(42 + 8 * abs(math.sin(t * 0.05)) + random.uniform(-1, 1), 1)
    ram_total = 4096.0
    ram_used = round(1200 + 200 * abs(math.sin(t * 0.08)) + random.uniform(-50, 50), 1)
    disk_total = 32.0
    disk_used = round(8.5 + 0.001 * t, 2)
    return {
        "cpu_percent": cpu,
        "cpu_temp": temp,
        "ram_percent": round(ram_used / ram_total * 100, 1),
        "ram_used_mb": ram_used,
        "ram_total_mb": ram_total,
        "disk_percent": round(disk_used / disk_total * 100, 1),
        "disk_used_gb": disk_used,
        "disk_total_gb": disk_total,
        "uptime_seconds": round(time.time() - _start_time),
    }


async def _real_stats() -> dict:
    try:
        import psutil
        cpu = psutil.cpu_percent(interval=0.1)
        ram = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        temp = None
        try:
            temps = psutil.sensors_temperatures()
            if "cpu_thermal" in temps:
                temp = temps["cpu_thermal"][0].current
            elif "coretemp" in temps:
                temp = temps["coretemp"][0].current
        except Exception:
            pass
        return {
            "cpu_percent": cpu,
            "cpu_temp": temp,
            "ram_percent": ram.percent,
            "ram_used_mb": round(ram.used / 1024 / 1024, 1),
            "ram_total_mb": round(ram.total / 1024 / 1024, 1),
            "disk_percent": disk.percent,
            "disk_used_gb": round(disk.used / 1024 / 1024 / 1024, 2),
            "disk_total_gb": round(disk.total / 1024 / 1024 / 1024, 2),
            "uptime_seconds": round(time.time() - psutil.boot_time()),
        }
    except Exception:
        return _mock_stats()
