import axios from 'axios';

const getBackendUrl = () => {
  if (typeof window !== 'undefined' && window.__NIVARA_BACKEND_URL__) {
    return window.__NIVARA_BACKEND_URL__;
  }
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
};

export const BACKEND_URL = getBackendUrl();
export const API_BASE = `${BACKEND_URL}/api`;

if (typeof window !== 'undefined') {
  if (window.location.protocol === 'https:' && (BACKEND_URL.startsWith('http://localhost') || BACKEND_URL.startsWith('http://127.0.0.1'))) {
    console.warn(
      `[NIVARA API] Warning: Frontend is running on HTTPS (${window.location.origin}), but REACT_APP_BACKEND_URL is set to '${BACKEND_URL}'. Insecure HTTP/localhost requests are blocked by browsers on mobile/external devices. Set REACT_APP_BACKEND_URL in Vercel to your public HTTPS backend URL.`
    );
  }
}

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('nivara_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export function getErrorMessage(e, defaultMsg = 'Something went wrong') {
  if (e?.response) {
    const detail = e.response.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail.map((d) => d.msg || (typeof d === 'string' ? d : JSON.stringify(d))).join(', ');
    }
    if (detail && typeof detail === 'object' && detail.message) {
      return detail.message;
    }
    if (e.response.status === 401) return 'Invalid credentials';
    if (e.response.status === 403) return 'Access denied';
    if (e.response.status === 404) return 'Resource not found';
    if (e.response.status >= 500) return 'Server error. Please try again later.';
    return e.response.data?.message || defaultMsg;
  }

  // Network / connection error
  if (e?.code === 'ERR_NETWORK' || e?.message === 'Network Error' || !e?.response) {
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && (API_BASE.startsWith('http://localhost') || API_BASE.startsWith('http://127.0.0.1'))) {
      return `Unable to connect to server: Frontend is on HTTPS but API is set to '${API_BASE}'. Please configure REACT_APP_BACKEND_URL in Vercel with your public backend URL.`;
    }
    return `Unable to connect to NIVARA server (${API_BASE}). Please verify the backend is running.`;
  }

  return e?.message || defaultMsg;
}

export function connectWS(onMessage) {
  const token = localStorage.getItem('nivara_token');
  if (!token) return null;
  const wsUrl = BACKEND_URL.replace(/^http/, 'ws') + `/api/ws?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => {
    try { onMessage(JSON.parse(ev.data)); } catch (e) { /* ignore */ }
  };
  return ws;
}

