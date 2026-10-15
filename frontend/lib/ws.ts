// WebSocket client with reconnect + heartbeat.
// Two sockets: /ws/notifications/ and /ws/presence/.

import { getAccessToken, API_BASE } from './api';

type Listener = (data: any) => void;

function wsUrl(path: string): string {
  const token = getAccessToken() || '';
  if (API_BASE) {
    const u = new URL(API_BASE);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = path;
    u.search = `token=${encodeURIComponent(token)}`;
    return u.toString();
  }
  // same-origin: use location
  const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = typeof window !== 'undefined' ? window.location.host : '';
  return `${proto}://${host}${path}?token=${encodeURIComponent(token)}`;
}

export class ReconnectingWS {
  private ws: WebSocket | null = null;
  private closed = false;
  private attempts = 0;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(status: 'connecting' | 'open' | 'closed') => void>();
  private heartbeatTimer: any = null;

  constructor(private path: string, private heartbeatMs: number | null = null) {}

  connect() {
    this.closed = false;
    this.open();
  }

  private open() {
    this.setStatus('connecting');
    const url = wsUrl(this.path);
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.setStatus('open');
      if (this.heartbeatMs) {
        this.heartbeatTimer = setInterval(() => {
          try { ws.send(JSON.stringify({ type: 'heartbeat' })); } catch {}
        }, this.heartbeatMs);
      }
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        this.listeners.forEach((l) => l(data));
      } catch {}
    };
    ws.onclose = () => {
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      this.setStatus('closed');
      if (!this.closed) this.scheduleReconnect();
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  private scheduleReconnect() {
    this.attempts += 1;
    const delay = Math.min(30000, 500 * Math.pow(2, this.attempts));
    setTimeout(() => { if (!this.closed) this.open(); }, delay);
  }

  send(obj: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  onMessage(l: Listener) { this.listeners.add(l); return () => this.listeners.delete(l); }
  onStatus(l: (s: 'connecting' | 'open' | 'closed') => void) { this.statusListeners.add(l); return () => this.statusListeners.delete(l); }

  private setStatus(s: 'connecting' | 'open' | 'closed') {
    this.statusListeners.forEach((l) => l(s));
  }

  close() { this.closed = true; try { this.ws?.close(); } catch {} }
}
