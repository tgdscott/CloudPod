export function isApiError(e) {
  return e && typeof e === "object" && (e.error || e.detail || e.message);
}

// Base URL for API requests. In dev, you can leave this blank and rely on Vite's /api proxy.
const BASE = (import.meta && import.meta.env && (import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL)
  ? String(import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, "")
  : "");

function buildUrl(path) {
  if (!path) return BASE || "";
  if (/^https?:\/\//i.test(path)) return path; // already absolute
  // If BASE provided, prefix it; otherwise return path as-is (works with /api proxy or same-origin)
  return `${BASE}${path}`;
}

async function req(path, opts = {}) {
  const url = buildUrl(path);
  const res = await fetch(url, {
    credentials: "include",
    headers: { ...(opts.headers || {}) },
    ...opts,
  });
  // Try to parse JSON if content-type hints it, otherwise allow empty
  const ct = res.headers.get && res.headers.get("content-type");
  const canJson = ct && ct.includes("application/json");
  const data = canJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
  if (!res.ok) {
    if (canJson) {
      const payload = (data && typeof data === 'object') ? data : { message: String(data || 'Request failed') };
      throw { status: res.status, ...payload };
    }
    throw { status: res.status, message: String(data || "Request failed") };
  }
  return canJson ? data : { ok: true, data };
}

function jsonBody(body) {
  return body === undefined || body === null ? undefined : JSON.stringify(body);
}

export function makeApi(token) {
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  return {
    get: (p, opts={}) => req(p, { ...opts, method: "GET", headers: { ...authHeader, ...(opts.headers||{}) } }),
    post: (p, body, opts={}) => req(p, { ...opts, method: "POST", headers: { 'Content-Type': 'application/json', ...authHeader, ...(opts.headers||{}) }, body: jsonBody(body) }),
    put: (p, body, opts={}) => req(p, { ...opts, method: "PUT", headers: { 'Content-Type': 'application/json', ...authHeader, ...(opts.headers||{}) }, body: jsonBody(body) }),
    patch: (p, body, opts={}) => req(p, { ...opts, method: "PATCH", headers: { 'Content-Type': 'application/json', ...authHeader, ...(opts.headers||{}) }, body: jsonBody(body) }),
    del: (p, opts={}) => req(p, { ...opts, method: "DELETE", headers: { ...authHeader, ...(opts.headers||{}) } }),
    raw: (p, opts={}) => req(p, { ...opts, headers: { ...authHeader, ...(opts.headers||{}) } }),
  };
}

export function assetUrl(path) {
  // Build a full URL for static assets that come from the API origin (e.g., /static or cover paths)
  return buildUrl(path);
}

// Backward-compatible simple API without auth
export const api = {
  get: (p, opts) => req(p, { ...(opts||{}), method: "GET" }),
  post: (p, body, opts) => req(p, { ...(opts||{}), method: "POST", headers: { 'Content-Type': 'application/json', ...((opts&&opts.headers)||{}) }, body: jsonBody(body) }),
};
