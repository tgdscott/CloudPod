import { useEffect, useState } from "react";

// Use the tiny API client we added in PR1
// Relative import keeps us safe regardless of aliases
import { api } from "../../lib/apiClient.js";

const API_BASE = (import.meta && import.meta.env && import.meta.env.VITE_API_BASE) || "";

export default function PodcastPublisherTool() {
  const [shows, setShows] = useState([]);
  const [showsLoading, setShowsLoading] = useState(true);
  const [showsError, setShowsError] = useState("");
  const [selectedShowId, setSelectedShowId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [description, setDescription] = useState("");
  const [coverFile, setCoverFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  // Load Spreaker shows with friendly states
  useEffect(() => {
    let mounted = true;
    setShowsLoading(true);
    api.get("/api/spreaker/shows")
      .then((data) => {
        if (!mounted) return;
        const list = Array.isArray(data?.shows) ? data.shows : [];
        setShows(list);
        setShowsError(list.length ? "" : "No shows found. Connect Spreaker in Settings.");
      })
      .catch((err) => {
        const msg = err?.error?.message || "Unable to load shows";
        if (!mounted) return;
        setShowsError(msg);
      })
      .finally(() => mounted && setShowsLoading(false));
    return () => { mounted = false; };
  }, []);

  async function uploadCoverIfProvided() {
    if (!coverFile) return null;
    const form = new FormData();
    form.append("file", coverFile);
    const res = await fetch(`${String(API_BASE).replace(/\/+$/,"")}/api/media/upload/episode_cover`, {
      method: "POST",
      body: form,
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || "Cover upload failed";
      throw new Error(msg);
    }
    // backend returns an array; take first filename
    const arr = Array.isArray(data) ? data : [];
    return arr[0]?.filename || null;
  }

  async function handlePublish() {
    setStatus("");
    if (!episodeId.trim()) {
      setStatus("Please paste an Episode ID first.");
      return;
    }
    if (!selectedShowId) {
      setStatus("Pick a Spreaker show before publishing.");
      return;
    }
    setBusy(true);
    try {
      // Optional cover upload (safe no-op if none)
      await uploadCoverIfProvided();

      // Publish to canonical route (alias exists too)
      const body = {
        spreaker_show_id: String(selectedShowId),
        publish_state: "unpublished", // change to "public" when ready
        description: description || "",
      };
      const out = await api.post(`/api/episodes/${encodeURIComponent(episodeId)}/publish`, body);
      setStatus(out?.message || "Published (check Episode History & Spreaker).");
    } catch (e) {
      const msg =
        e?.error?.message ||
        e?.message ||
        "Publish failed. Check your login and Spreaker connection.";
      setStatus(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-semibold">Podcast Publisher Tool</h1>

      <div className="space-y-2">
        <label className="text-sm font-medium">Episode ID</label>
        <input
          type="text"
          value={episodeId}
          onChange={(e) => setEpisodeId(e.target.value)}
          className="w-full border rounded-md p-2"
          placeholder="Paste the Episode ID (from assemble/status or episode history)"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Spreaker Show</label>
        {showsLoading ? (
          <div className="text-sm text-muted-foreground">Loading shows…</div>
        ) : (
          <>
            <select
              className="w-full border rounded-md p-2"
              value={selectedShowId}
              onChange={(e) => setSelectedShowId(e.target.value)}
            >
              <option value="">— Select a show —</option>
              {shows.map((s) => (
                <option key={s.show_id ?? s.id} value={s.show_id ?? s.id}>
                  {s.title ?? s.name ?? `Show ${s.show_id ?? s.id}`}
                </option>
              ))}
            </select>
            {showsError ? (
              <div className="text-xs text-red-600">{showsError}</div>
            ) : null}
          </>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Episode Description (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full border rounded-md p-2"
          placeholder="Short notes to send with the publish request"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Episode Cover (optional)</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
        />
        <div className="text-xs text-muted-foreground">
          Upload uses category <code>episode_cover</code> (correct bucket).
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="px-4 py-2 rounded-md bg-black text-white disabled:opacity-50"
          onClick={handlePublish}
          disabled={busy || !selectedShowId || !episodeId.trim()}
        >
          {busy ? "Publishing…" : "Publish"}
        </button>
        {status ? <div className="text-sm">{status}</div> : null}
      </div>

      <div className="text-xs text-muted-foreground">
        Tip: If you see “Not authenticated”, make sure you’re logged in first.
      </div>
    </div>
  );
}
