// Temporary stub; replace with real implementation later.
const LS_KEY = "ab_drafts";

function readAll() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
function writeAll(map) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch {}
}
function uid() { return crypto?.randomUUID?.() || Math.random().toString(36).slice(2); }

// Hook-style API most pages expect
export function useAbDrafts() {
  const map = readAll();
  const drafts = Object.entries(map).map(([id, d]) => ({ id, ...d }));

  function get(id) { return map[id] || null; }
  function upsert(draft) {
    const id = draft?.id || uid();
    map[id] = { ...draft, id };
    writeAll(map);
    return id;
  }
  function remove(id) {
    if (id in map) { delete map[id]; writeAll(map); }
  }

  return { drafts, get, upsert, remove };
}

// Also export some helpers in case pages import named funcs
export function getDraft(id) { return readAll()[id] || null; }
export function saveDraft(draft) {
  const map = readAll();
  const id = draft?.id || uid();
  map[id] = { ...draft, id };
  writeAll(map);
  return id;
}
export function deleteDraft(id) {
  const map = readAll();
  if (id in map) { delete map[id]; writeAll(map); }
}

// Default export as alias (covers default-import usage)
export default useAbDrafts;
