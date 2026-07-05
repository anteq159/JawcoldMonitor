import asyncio
import math
import random
import time
from typing import Optional, Tuple
from app.core.config import settings

_start_time = time.time()
_last_net_sample: Optional[Tuple[float, int, int]] = None


async def get_system_stats() -> dict:
    if settings.PREVIEW_MODE:
        return _mock_stats()
    return await _real_stats()


def _mock_stats() -> dict:
    t = time.time() - _start_time
    cpu = round(20 + 15 * abs(math.sin(t * 0.1)) + random.uniform(-2, 2), 1)
    temp = round(42 + 8 * abs(math.sin(t * 0.05)) + random.uniform(-1, 1), 1)
    ram_total = 4096.0
    ram_used = round(1200 + 200 * abs(math.sin(t * 0.08)) + random.uniform(-50, 50), 1)
    disk_total = 32.0
    disk_used = round(8.5 + 0.001 * t, 2)
    net_sent = round(max(2000 + 3000 * abs(math.sin(t * 0.15)) + random.uniform(-500, 1500), 0), 1)
    net_recv = round(max(8000 + 12000 * abs(math.sin(t * 0.12 + 1)) + random.uniform(-1000, 4000), 0), 1)
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
        "net_sent_bytes_per_sec": net_sent,
        "net_recv_bytes_per_sec": net_recv,
        "net_connected": True,
    }


def _network_rate(bytes_sent: int, bytes_recv: int) -> dict:
    global _last_net_sample
    now = time.time()
    if _last_net_sample is None:
        sent_rate = recv_rate = 0.0
    else:
        prev_time, prev_sent, prev_recv = _last_net_sample
        elapsed = max(now - prev_time, 0.001)
        sent_rate = max((bytes_sent - prev_sent) / elapsed, 0.0)
        recv_rate = max((bytes_recv - prev_recv) / elapsed, 0.0)
    _last_net_sample = (now, bytes_sent, bytes_recv)
    return {"net_sent_bytes_per_sec": round(sent_rate, 1), "net_recv_bytes_per_sec": round(recv_rate, 1)}


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

        net_connected = True
        net_rates = {"net_sent_bytes_per_sec": 0.0, "net_recv_bytes_per_sec": 0.0}
        try:
            net_io = psutil.net_io_counters()
            net_rates = _network_rate(net_io.bytes_sent, net_io.bytes_recv)
            if_stats = psutil.net_if_stats()
            net_connected = any(v.isup for k, v in if_stats.items() if k not in ("lo", "lo0"))
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
            "net_connected": net_connected,
            **net_rates,
        }
    except Exception:
        return _mock_stats()
