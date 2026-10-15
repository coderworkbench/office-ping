// Stable per-browser device id. Not a user identifier.
export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  const KEY = 'op_device_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2);
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function detectBrowser(): { browser: string; os: string } {
  if (typeof navigator === 'undefined') return { browser: '', os: '' };
  const ua = navigator.userAgent;
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Other';
  const os =
    /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS'
    : 'Other';
  return { browser, os };
}
