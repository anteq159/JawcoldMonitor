export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getNotificationPermission(): NotificationPermission {
  return isNotificationSupported() ? Notification.permission : 'denied'
}

// Must be called from a user gesture (click handler) - browsers refuse to
// show the permission prompt otherwise, so this is never called on mount.
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied'
  return Notification.requestPermission()
}

// Only fires when the tab is hidden/unfocused - the in-app toast already
// covers the focused-tab case, so a system notification too would be
// redundant noise on top of it.
export function notifyIfHidden(title: string, options?: NotificationOptions): void {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return
  if (!document.hidden) return
  try {
    new Notification(title, options)
  } catch {
    // some environments (e.g. iOS Safari home-screen webapps) can throw here
  }
}
