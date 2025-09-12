import { makeApi } from "@/lib/apiClient.js";

// Named export required by: import { abApi } from "../lib/abApi"
export function abApi() {
  const api = makeApi();
  return {
    // thin pass-throughs
    get: api.get,
    post: api.post,
    put: api.put,
    delete: api.delete,

    // convenience helpers (safe placeholders)
    uploadAudio(formData) { return api.post("/ab/upload", formData); },
    createDraft(payload) { return api.post("/ab/drafts", payload); },
    getStatus(id) { return api.get(`/ab/drafts/${id}/status`); },
  };
}

// Also provide default export alias (covers default-import usage elsewhere)
export default abApi;
