"""Size-capped reading of multipart uploads.

`await file.read()` with no limit buffers the entire upload in RAM before
any validation runs - on a Raspberry Pi a single oversized POST (multi-GB
by accident or on purpose) can OOM the backend before the endpoint's own
size check ever executes. nginx's client_max_body_size is the first line
of defense; this is the second, so the backend stays safe even when
reached directly (dev, misconfigured proxy).
"""

from fastapi import HTTPException, UploadFile

_CHUNK = 1024 * 1024


async def read_upload_limited(file: UploadFile, max_bytes: int) -> bytes:
    chunks = []
    total = 0
    while True:
        chunk = await file.read(_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"Plik jest za duży (limit {max_bytes // (1024 * 1024)} MB)",
            )
        chunks.append(chunk)
    return b"".join(chunks)
