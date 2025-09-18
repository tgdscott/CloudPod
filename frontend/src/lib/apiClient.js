export function isApiError(e) {
  return e && typeof e === "object" && (e.error || e.detail || e.message);
}

// Base URL for API requests. In dev, you can leave this blank and rely on Vite's /api proxy.
const runtimeBase = (() => {
  const envBase = (import.meta && import.meta.env && (import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL))
    ? String(import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, '')
    : '';
  if (envBase) return envBase;
  if (typeof window !== 'undefined' && window.location?.origin) {
    let origin = window.location.origin;
    if (origin.includes('app.')) {
      origin = origin.replace('app.', 'api.');
    }
    return origin.replace(/\/+$/, '');
  }
  return '';
})();

export function buildApiUrl(path) {
  const base = runtimeBase;
  if (!path) return base || '';
  if (/^https?:\/\//i.test(path)) return path; // already absolute
  return base ? `${base}${path}` : path;
}

async function req(path, opts = {}) {
  const url = buildApiUrl(path);
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
  // Compute Authorization header at call time so callers that provided a
  // null/undefined token initially still pick up a token stored later in
  // localStorage (e.g., after OAuth redirect). This avoids races where
  // components call makeApi before AuthProvider has set its token state.
  const authFor = (optsHeaders = {}) => {
    const provided = token || (() => { try { return localStorage.getItem('authToken'); } catch { return null; } })();
    return provided ? { Authorization: `Bearer ${provided}`, ...(optsHeaders || {}) } : { ...(optsHeaders || {}) };
  };

  return {
    get: (p, opts={}) => req(p, { ...opts, method: "GET", headers: authFor(opts.headers) }),
    post: (p, body, opts={}) => req(p, { ...opts, method: "POST", headers: authFor({ 'Content-Type': 'application/json', ...(opts.headers||{}) }), body: jsonBody(body) }),
    put: (p, body, opts={}) => req(p, { ...opts, method: "PUT", headers: authFor({ 'Content-Type': 'application/json', ...(opts.headers||{}) }), body: jsonBody(body) }),
    patch: (p, body, opts={}) => req(p, { ...opts, method: "PATCH", headers: authFor({ 'Content-Type': 'application/json', ...(opts.headers||{}) }), body: jsonBody(body) }),
    del: (p, opts={}) => req(p, { ...opts, method: "DELETE", headers: authFor(opts.headers) }),
    raw: (p, opts={}) => req(p, { ...opts, headers: authFor(opts.headers) }),
  };
}

export function assetUrl(path) {
  // Build a full URL for static assets that come from the API origin (e.g., /static or cover paths)
  return buildApiUrl(path);
}

// Backward-compatible simple API without auth
export const api = {
  get: (p, opts) => req(p, { ...(opts||{}), method: "GET" }),
  post: (p, body, opts) => req(p, { ...(opts||{}), method: "POST", headers: { 'Content-Type': 'application/json', ...((opts&&opts.headers)||{}) }, body: jsonBody(body) }),
};
