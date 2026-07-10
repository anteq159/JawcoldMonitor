from fastapi import Request
from slowapi import Limiter


def client_ip(request: Request) -> str:
    """Real client IP for rate limiting and audit logs. Behind the nginx
    container request.client.host is always nginx's docker-network IP, so
    keying the login rate limit on it would throttle every user together
    (and audit entries would all show the same address). nginx sets
    X-Real-IP to $remote_addr - the actual TCP peer, which a client cannot
    forge (unlike X-Forwarded-For, which nginx appends to whatever the
    client sent). The backend port is not published on the host, so every
    request arrives through nginx; the fallback only fires in local dev."""
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")


limiter = Limiter(key_func=client_ip)
