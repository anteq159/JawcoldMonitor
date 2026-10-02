// Human labels and a tone for every event type the backend writes - the
// raw identifiers ("sensor_discovered") meant nothing to an operator.
export const EVENT_TYPES: Record<string, { label: string; tone: 'good' | 'bad' | 'warn' | 'info' }> = {
  device_connected: { label: 'Sterownik online', tone: 'good' },
  device_disconnected: { label: 'Sterownik offline', tone: 'bad' },
  device_discovered: { label: 'Nowy sterownik', tone: 'info' },
  device_offline_alarm: { label: 'Alarm: brak komunikacji', tone: 'bad' },
  device_offline_resolved: { label: 'Komunikacja przywrócona', tone: 'good' },
  hardware_alarm_triggered: { label: 'Alarm sterownika', tone: 'bad' },
  hardware_alarm_resolved: { label: 'Alarm sterownika ustąpił', tone: 'good' },
  register_written: { label: 'Zmiana nastawy', tone: 'warn' },
  sensor_discovered: { label: 'Nowy czujnik', tone: 'info' },
  sensor_offline: { label: 'Czujnik bez odczytu', tone: 'bad' },
  sensor_online: { label: 'Czujnik ponownie działa', tone: 'good' },
  disk_alarm: { label: 'Alarm: mało miejsca na dysku', tone: 'bad' },
  auto_backup: { label: 'Kopia zapasowa', tone: 'good' },
  auto_backup_failed: { label: 'Błąd kopii zapasowej', tone: 'bad' },
  settings_changed: { label: 'Zmiana ustawień', tone: 'warn' },
  power_action: { label: 'Restart / zasilanie', tone: 'warn' },
  update_applied: { label: 'Aktualizacja', tone: 'info' },
  update_rolled_back: { label: 'Wycofanie aktualizacji', tone: 'warn' },
  manufacturer_lookup: { label: 'Rozpoznawanie sterownika', tone: 'info' },
}

export const TONE: Record<string, string> = {
  good: 'text-good', bad: 'text-crit', warn: 'text-warn', info: 'text-accent',
}
