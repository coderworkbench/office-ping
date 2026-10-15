// REST client for the Office Ping backend.
// Base URL comes from NEXT_PUBLIC_API_URL (defaults to same-origin /api).
// JWT access token kept in-memory; refresh token in localStorage.

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || (typeof window === 'undefined' ? 'http://backend:8000' : '');

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem('op_access', token);
    else localStorage.removeItem('op_access');
  }
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== 'undefined') {
    accessToken = localStorage.getItem('op_access');
  }
  return accessToken;
}

export function setRefreshToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem('op_refresh', token);
  else localStorage.removeItem('op_refresh');
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('op_refresh');
}

async function refreshAccess(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  const r = await fetch(`${API_BASE}/api/auth/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });
  if (!r.ok) return false;
  const data = await r.json();
  setAccessToken(data.access);
  if (data.refresh) setRefreshToken(data.refresh);
  return true;
}

export async function apiFetch<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let r = await fetch(url, { ...init, headers, credentials: 'include' });
  if (r.status === 401 && (await refreshAccess())) {
    headers.set('Authorization', `Bearer ${getAccessToken()}`);
    r = await fetch(url, { ...init, headers, credentials: 'include' });
  }
  if (!r.ok) {
    const text = await r.text();
    throw new ApiError(r.status, text);
  }
  if (r.status === 204) return undefined as unknown as T;
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('application/json')) return (await r.json()) as T;
  return (await r.text()) as unknown as T;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Turn a DRF error body ({"detail": ...} or {"field": ["msg", ...]}) into one readable line.
export function apiErrorMessage(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (!(e instanceof ApiError)) return fallback;
  try {
    const body = JSON.parse(e.message);
    if (typeof body === 'string') return body;
    if (body.detail) return String(body.detail);
    const msgs = Object.values(body).flat().filter(Boolean).map(String);
    if (msgs.length) return msgs.join(' ');
  } catch {}
  return fallback;
}

export async function login(username: string, password: string) {
  const r = await fetch(`${API_BASE}/api/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) throw new ApiError(r.status, await r.text());
  const data = await r.json();
  setAccessToken(data.access);
  setRefreshToken(data.refresh);
  return data;
}

export async function logout() {
  const refresh = getRefreshToken();
  try {
    await apiFetch('/api/auth/logout/', {
      method: 'POST',
      body: JSON.stringify({ refresh }),
    });
  } catch {
    // best-effort
  }
  setAccessToken(null);
  setRefreshToken(null);
}

export { API_BASE };
