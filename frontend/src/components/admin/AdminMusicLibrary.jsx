import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Play, Pause, Plus, Trash2, Save } from 'lucide-react';
import { useAuth } from '@/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { makeApi } from '@/lib/apiClient';

export default function AdminMusicLibrary() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewingId, setPreviewingId] = useState(null);
  const audioRef = useRef(null);

  const auth = token ? { Authorization: `Bearer ${token}` } : {};

  const loadAssets = async () => {
    setLoading(true);
    try {
      const data = await makeApi(token).get('/api/admin/music/assets');
      setAssets(Array.isArray(data?.assets) ? data.assets : []);
    } catch {
      setAssets([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadAssets(); }, []);

  const togglePreview = (asset) => {
    const url = asset.preview_url || asset.url || asset.filename;
    if (!url) return;
    if (previewingId === asset.id) {
      try { audioRef.current?.pause(); } catch {}
      audioRef.current = null;
      setPreviewingId(null);
      return;
    }
    try {
      if (audioRef.current) { try { audioRef.current.pause(); } catch {} }
      const a = new Audio(url);
      audioRef.current = a;
      setPreviewingId(asset.id);
      const stopAt = 20;
      const onTick = () => {
        if (a.currentTime >= stopAt) { a.pause(); setPreviewingId(null); a.removeEventListener('timeupdate', onTick); }
      };
      a.addEventListener('timeupdate', onTick);
      a.onended = () => { setPreviewingId(null); try{ a.removeEventListener('timeupdate', onTick);}catch{} };
      a.play().catch(()=> setPreviewingId(null));
    } catch { setPreviewingId(null); }
  };

  const addBlank = () => {
    setAssets(prev => [{ id: `new-${Date.now()}`, display_name: '', mood_tags: [], url: '', isNew: true }, ...prev]);
  };

  const removeAsset = async (asset) => {
    if (String(asset.id).startsWith('new-')) {
      setAssets(prev => prev.filter(a => a.id !== asset.id));
      return;
    }
    if (!confirm('Delete this music asset?')) return;
    try {
  await makeApi(token).raw(`/api/admin/music/assets/${asset.id}`, { method: 'DELETE' });
      setAssets(prev => prev.filter(a => a.id !== asset.id));
      try { toast({ title: 'Deleted', description: `${asset.display_name || 'Asset'} removed.` }); } catch {}
    } catch (e) {
      try { toast({ title: 'Delete failed', description: 'Could not remove asset', variant: 'destructive' }); } catch {}
    }
  };

  const saveAsset = async (asset) => {
    setSaving(true);
    try {
      const body = { display_name: asset.display_name, url: asset.url, preview_url: asset.preview_url || asset.url, mood_tags: asset.mood_tags || [] };
      if (String(asset.id).startsWith('new-')) {
  const r = await makeApi(token).post('/api/admin/music/assets', body);
  if (r && r.status && r.status >= 400) throw new Error('Create failed');
      } else {
  const r = await makeApi(token).put(`/api/admin/music/assets/${asset.id}`, body);
  if (r && r.status && r.status >= 400) throw new Error('Update failed');
      }
      try { toast({ title: 'Saved', description: 'Music asset saved.' }); } catch {}
      loadAssets();
    } catch (e) {
      try { toast({ title: 'Save failed', description: e.message || 'Could not save asset', variant: 'destructive' }); } catch {}
    } finally { setSaving(false); }
  };

  const updateField = (id, key, value) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, [key]: value } : a));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Music Library</h2>
        <div className="flex items-center gap-2">
          <Button onClick={addBlank}><Plus className="h-4 w-4 mr-1" /> Add New</Button>
          <Button variant="outline" onClick={loadAssets} disabled={loading}>Refresh</Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assets {loading && <span className="text-xs text-muted-foreground">(Loading…)</span>}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[48px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Preview URL</TableHead>
                <TableHead>Mood Tags (comma)</TableHead>
                <TableHead className="w-[140px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map(a => {
                const canPreview = !!(a.preview_url || a.url || a.filename);
                const moods = Array.isArray(a.mood_tags) ? a.mood_tags.join(', ') : (a.mood_tags || '');
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Button size="icon" variant="outline" disabled={!canPreview} onClick={() => canPreview && togglePreview(a)}>
                        {previewingId === a.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Input value={a.display_name || ''} onChange={(e)=> updateField(a.id, 'display_name', e.target.value)} placeholder="Display name" />
                    </TableCell>
                    <TableCell>
                      <Input value={a.url || ''} onChange={(e)=> updateField(a.id, 'url', e.target.value)} placeholder="https://…/track.mp3" />
                    </TableCell>
                    <TableCell>
                      <Input value={a.preview_url || ''} onChange={(e)=> updateField(a.id, 'preview_url', e.target.value)} placeholder="(optional, defaults to URL)" />
                    </TableCell>
                    <TableCell>
                      <Input value={moods} onChange={(e)=> updateField(a.id, 'mood_tags', e.target.value.split(',').map(s=>s.trim()).filter(Boolean))} placeholder="calm, upbeat, cinematic" />
                    </TableCell>
                    <TableCell className="flex items-center gap-2">
                      <Button size="sm" onClick={()=> saveAsset(a)} disabled={saving}><Save className="h-4 w-4 mr-1" /> Save</Button>
                      <Button size="sm" variant="destructive" onClick={()=> removeAsset(a)}><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
