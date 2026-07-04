import { useEffect, useState } from 'react'
import { Cpu, MemoryStick, HardDrive, Thermometer, Radio, Network } from 'lucide-react'
import { useDeviceStore } from '../../../store/devices'
import { getServicesStatus, getRS485Status } from '../../../api/system'
import { WidgetCard } from '../WidgetCard'
import type { ServiceStatus } from '../../../types/websocket'

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${bytesPerSec.toFixed(0)} B/s`
}

export function RpiMonitorWidget() {
  const stats = useDeviceStore((s) => s.systemStats)
  const [services, setServices] = useState<ServiceStatus[]>([])
  const [rs485, setRs485] = useState<{ devices_online: number; devices_offline: number } | null>(null)

  useEffect(() => {
    const load = () => {
      getServicesStatus().then(setServices).catch(() => {})
      getRS485Status().then(setRs485).catch(() => {})
    }
    load()
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [])

  return (
    <WidgetCard title="Raspberry Pi i komunikacja">
      <div className="p-4 space-y-4 text-sm">
        {stats ? (
          <div className="grid grid-cols-2 gap-3">
            <Metric icon={<Cpu size={13} />} label="CPU" value={`${stats.cpu_percent.toFixed(0)}%`} />
            <Metric icon={<Thermometer size={13} />} label="Temperatura" value={stats.cpu_temp != null ? `${stats.cpu_temp.toFixed(0)}°C` : '—'} />
            <Metric icon={<MemoryStick size={13} />} label="RAM" value={`${stats.ram_percent.toFixed(0)}%`} />
            <Metric icon={<HardDrive size={13} />} label="Dysk" value={`${stats.disk_percent.toFixed(0)}%`} />
            <Metric icon={<Network size={13} />} label="Sieć ↑" value={formatRate(stats.net_sent_bytes_per_sec)} />
            <Metric icon={<Network size={13} />} label="Sieć ↓" value={formatRate(stats.net_recv_bytes_per_sec)} />
          </div>
        ) : (
          <p className="text-ink-muted text-xs">Oczekiwanie na statystyki…</p>
        )}

        <div className="border-t border-border pt-3 space-y-1.5">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">Usługi</p>
          {services.map((svc) => (
            <div key={svc.name} className="flex items-center justify-between">
              <span className="text-ink-body text-xs">{svc.name}</span>
              <span className={`flex items-center gap-1.5 text-xs ${svc.status === 'online' ? 'text-good' : 'text-crit'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${svc.status === 'online' ? 'bg-good' : 'bg-crit'}`} />
                {svc.status}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-3 space-y-1.5">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">Protokoły</p>
          <div className="flex items-center justify-between">
            <span className="text-ink-body text-xs flex items-center gap-1.5"><Radio size={12} /> RS485 / Modbus RTU</span>
            <span className="text-xs text-ink-muted">
              {rs485 ? `${rs485.devices_online} online · ${rs485.devices_offline} offline` : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between opacity-60">
            <span className="text-ink-body text-xs flex items-center gap-1.5"><Network size={12} /> Modbus TCP</span>
            <span className="text-xs text-ink-muted">nieskonfigurowany</span>
          </div>
        </div>
      </div>
    </WidgetCard>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink-muted">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-ink-muted uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-ink">{value}</p>
      </div>
    </div>
  )
}
