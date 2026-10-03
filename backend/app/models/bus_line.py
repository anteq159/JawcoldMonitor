from sqlalchemy import String, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin


class BusLine(Base, TimestampMixin):
    """One physical RS485 line: a serial port with its own speed and frame
    format. Controllers that cannot share a bus (Eliwell IDPlus is fixed at
    9600 b/s, Carel MPXPRO at 19200 8N2) each get a line on a separate port
    of the adapter; lines are polled in parallel."""
    __tablename__ = "bus_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    port: Mapped[str] = mapped_column(String(256), nullable=False)
    baudrate: Mapped[int] = mapped_column(Integer, default=19200, nullable=False)
    parity: Mapped[str] = mapped_column(String(1), default="N", nullable=False)
    stopbits: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    @property
    def frame(self) -> str:
        """"19200 8N2" - how installers and manuals write it."""
        return f"{self.baudrate} 8{self.parity}{self.stopbits}"
