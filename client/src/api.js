// Small fetch wrapper that attaches the JWT and parses JSON errors.
const TOKEN_KEY = 'quizhub_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// Prefer VITE_API_BASE, but fall back to the deployed Render URL for Netlify builds
const BASE = import.meta.env.VITE_API_BASE || 'https://quizhub-jxn6.onrender.com';

async function request(method, url, body, isForm = false) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (isForm) {
    payload = body; // FormData: let the browser set Content-Type
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const finalUrl = url.startsWith('http') ? url : `${BASE}${url}`;
  const res = await fetch(finalUrl, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.payload = data;
    throw error;
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  postForm: (url, formData) => request('POST', url, formData, true),
  patchForm: (url, formData) => request('PATCH', url, formData, true),
  patch: (url, body) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
};
