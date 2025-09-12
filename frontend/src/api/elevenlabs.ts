export type VoiceItem = {
  voice_id: string;
  name: string;
  common_name?: string;
  description: string;
  preview_url?: string | null;
  labels: Record<string, string>;
};

export async function fetchVoices(
  search = "",
  page = 1,
  size = 50
): Promise<{ items: VoiceItem[]; total: number; page: number; size: number }> {
  const r = await fetch(
    `/api/elevenlabs/voices?search=${encodeURIComponent(search)}&page=${page}&size=${size}`,
    { credentials: "include" }
  );
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
