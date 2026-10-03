import api from './client'

// Linie RS485 - separate serial ports, each with its own speed and frame
// (backend/app/api/v1/lines.py).
export interface BusLine {
  id: number
  name: string
  port: string
  baudrate: number
  parity: 'N' | 'E' | 'O'
  stopbits: 1 | 2
  enabled: boolean
  frame: string
  is_default: boolean
  devices_online: number
  devices_offline: number
  device_count: number
  port_present: boolean
}
export type BusLineIn = Pick<BusLine, 'name' | 'port' | 'baudrate' | 'parity' | 'stopbits' | 'enabled'>

export interface BusRequirement {
  baudrates: number[] | null
  parities: string[] | null
  stopbits: number[] | null
  factory: string
  note: string
}

export const BAUDRATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]

export const getLines = (): Promise<BusLine[]> => api.get('/lines/').then((r) => r.data)
export const createLine = (data: BusLineIn): Promise<BusLine> => api.post('/lines/', data).then((r) => r.data)
export const updateLine = (id: number, data: Partial<BusLineIn>): Promise<BusLine> => api.put(`/lines/${id}`, data).then((r) => r.data)
export const deleteLine = (id: number) => api.delete(`/lines/${id}`)
export const getBusRequirements = (): Promise<Record<string, BusRequirement>> =>
  api.get('/device-profiles/bus-requirements').then((r) => r.data)

// Why a controller cannot talk on a line, or null when it fits.
export function lineMismatch(req: BusRequirement | undefined, line: BusLine | undefined): string | null {
  if (!req || !line) return null
  const problems: string[] = []
  if (req.baudrates && !req.baudrates.includes(line.baudrate)) problems.push(`prędkość ${req.baudrates.join(' / ')} b/s`)
  if (req.parities && !req.parities.includes(line.parity)) problems.push(`parzystość ${req.parities.join(' / ')}`)
  if (req.stopbits && !req.stopbits.includes(line.stopbits)) problems.push(`${req.stopbits.join(' / ')} bit(y) stopu`)
  return problems.length ? `Ten sterownik wymaga: ${problems.join(', ')}, a linia „${line.name}” ma ${line.frame}.` : null
}
