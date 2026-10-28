'use client';
/**
 * API client. Officer and teacher sessions are stored under different keys and
 * sent only to their own side of the API — mirroring the backend's two identities.
 * sessionStorage (not localStorage): a session ends when the browser tab closes.
 */
// Empty = same origin. A bare host name (as Render provides between services) becomes https://<host>.
const RAW_BASE = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/$/, '');
const BASE = RAW_BASE && !/^https?:\/\//.test(RAW_BASE) ? `https://${RAW_BASE}` : RAW_BASE;

const KEYS = { officer: 'tsc.officer.token', teacher: 'tsc.teacher.token' };

export function getToken(kind) {
  if (typeof window === 'undefined' || !KEYS[kind]) return null;
  try {
    return window.sessionStorage.getItem(KEYS[kind]);
  } catch {
    return null;
  }
}
export function setToken(kind, token) {
  try {
    if (token) window.sessionStorage.setItem(KEYS[kind], token);
    else window.sessionStorage.removeItem(KEYS[kind]);
  } catch {
    /* storage unavailable — the session lasts until reload */
  }
}

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.error) || `Request failed (${status})`);
    this.status = status;
    this.details = body && body.details;
    this.body = body;
  }
}

async function call(kind, path, { method = 'GET', body, raw, contentType } = {}) {
  const headers = {};
  const token = getToken(kind);
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (raw !== undefined) {
    payload = raw;
    headers['Content-Type'] = contentType;
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, { error: 'Cannot reach the server. Check your connection and try again.' });
  }
  if (res.status === 401 && token && !path.startsWith('/api/auth')) {
    setToken(kind, null);
    if (typeof window !== 'undefined') window.location.href = kind === 'teacher' ? '/portal/login?expired=1' : '/login?expired=1';
  }
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : await res.blob();
  if (!res.ok) throw new ApiError(res.status, type.includes('application/json') ? data : null);
  return data;
}

export const officerApi = {
  get: (p) => call('officer', p),
  post: (p, body) => call('officer', p, { method: 'POST', body: body || {} }),
  put: (p, body) => call('officer', p, { method: 'PUT', body }),
  patch: (p, body) => call('officer', p, { method: 'PATCH', body }),
  upload: (p, raw, contentType, method = 'POST') => call('officer', p, { method, raw, contentType }),
};

export const teacherApi = {
  get: (p) => call('teacher', p),
  post: (p, body) => call('teacher', p, { method: 'POST', body: body || {} }),
};

export const publicApi = {
  post: (p, body) => call('none', p, { method: 'POST', body }),
};

export function qs(params) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : '';
}
