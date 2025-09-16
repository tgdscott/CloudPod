import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/AuthContext';
import { makeApi } from '@/lib/apiClient';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Save, PlusCircle, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Simplified Audio Cleanup Settings: friendlier copy, fixed 250ms beep or single SFX play, and cleaner layout
const DEFAULT_SETTINGS = {
  removeFillers: true,
  fillerWords: ['um','uh','like'],
  fillerLeadTrimMs: 100,
  removePauses: true,
  maxPauseSeconds: 1.8,
  targetPauseSeconds: 0.6,
  commands: {
    flubber: { action: 'rollback_restart', trigger_keyword: 'flubber' },
    intern: {
      action: 'ai_command',
      trigger_keyword: 'intern',
      // New: explicit end markers (Stop phrases) and behavior
      end_markers: ['stop', 'stop intern'],
      remove_end_marker: true,
      keep_command_token_in_transcript: true,
    },
  }
};

function tokenizeVariants(value) {
  if(!value) return [];
  return value.split(/[|,]/).map(v=>v.trim()).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
}

export default function AudioCleanupSettings({ className }) {
  const { token } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [newCommandName, setNewCommandName] = useState('');
  const [sfxOptions, setSfxOptions] = useState([]);
  
  // Constants: 1 short beep @ 250ms, 1kHz, 0dB gain
  const BEEP_MS = 250;
  const BEEP_FREQ = 1000;
  const BEEP_GAIN_DB = 0;

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await makeApi(token).get('/api/users/me/audio-cleanup-settings');
      const raw = data?.settings || {};
      // Merge in default command shapes so flubber/intern always exist with sane defaults
      const base = (raw && Object.keys(raw).length) ? raw : DEFAULT_SETTINGS;
      const merged = {
        ...base,
        commands: { ...DEFAULT_SETTINGS.commands, ...(base.commands || {}) },
      };
      setSettings(merged);
      setDirty(false);
    } catch(e) {
      setError(e.message || String(e));
      if(!settings) setSettings(DEFAULT_SETTINGS);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(()=>{ load(); }, [load]);

  // Load available SFX for Custom Beep picker
  useEffect(() => {
    const run = async () => {
      try {
        const files = await makeApi(token).get('/api/media/');
        if (!files) return;
        const sfx = (files || []).filter(f => (f.category === 'sfx'));
        // Map to dropdown options: label from friendly_name or filename (nice), value = media_uploads/filename
        const opts = sfx.map(f => ({
          id: f.id,
          label: f.friendly_name || (f.filename?.split('_').slice(1).join('_')) || f.filename,
          value: `media_uploads/${f.filename}`
        }));
        setSfxOptions(opts);
      } catch {}
    };
    run();
  }, [token]);

  const update = patch => { setSettings(s => ({ ...s, ...patch })); setDirty(true); };
  const updateCommand = (name, patch) => { setSettings(s => ({ ...s, commands: { ...(s.commands||{}), [name]: { ...(s.commands?.[name]||{}), ...patch }}})); setDirty(true); };
  const removeCommand = (name) => { setSettings(s => { const next = { ...(s.commands||{}) }; delete next[name]; return { ...s, commands: next }; }); setDirty(true); };
  const addCommand = () => { const n = newCommandName.trim().toLowerCase().replace(/\s+/g,'_'); if(!n || settings.commands?.[n]) return; update({ commands: { ...(settings.commands||{}), [n]: { action: 'sfx', trigger_keyword: n }}}); setNewCommandName(''); };

  const save = async () => { if(!settings) return; setSaving(true); setError(null); try { const payload = { settings }; const r = await makeApi(token).put('/api/users/me/audio-cleanup-settings', payload); if (r && r.status && r.status >= 400) throw new Error('Save failed'); setDirty(false); } catch(e){ setError(e.message||String(e)); } finally { setSaving(false); } };

  // Enforce fixed beep parameters whenever censoring is enabled
  useEffect(() => {
    if (!settings?.censorEnabled) return;
    const needsFix = (settings.censorBeepMs !== BEEP_MS) || (settings.censorBeepFreq !== BEEP_FREQ) || (settings.censorBeepGainDb !== BEEP_GAIN_DB);
    if (needsFix) {
      setSettings(s => ({ ...s, censorBeepMs: BEEP_MS, censorBeepFreq: BEEP_FREQ, censorBeepGainDb: BEEP_GAIN_DB }));
      setDirty(true);
    }
  }, [settings?.censorEnabled]);

  if(!settings) return <Card className={className}><CardContent className="p-4 text-sm flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Loading…</CardContent></Card>;

  const commandEntries = Object.entries(settings.commands || {});

  return (
    <Card className={`${className||''} p-6 md:p-8`}> 
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Make your audio sound better</CardTitle>
            <div className="text-sm text-gray-600 mt-1">Simple, predictable cleanup while you record.</div>
          </div>
          <div className="flex gap-2 items-center">
            {dirty && <span className="text-sm text-amber-600">Unsaved</span>}
            <Button size="sm" variant="outline" disabled={loading} onClick={load} className="bg-transparent"><RefreshCw className={`w-4 h-4 mr-1 ${loading?'animate-spin':''}`} />Reload</Button>
            <Button size="sm" disabled={!dirty || saving} onClick={save} style={{ backgroundColor:'#2C3E50', color:'white' }}><Save className="w-4 h-4 mr-1" />{saving?'Saving…':'Save'}</Button>
          </div>
        </div>
        {error && <div className="text-sm text-red-600 mt-1">{error}</div>}
      </CardHeader>
      <CardContent className="space-y-8 text-[15px]">
        {/* Audio Cleanup (plain-English) */}
        <div className="space-y-4">
          <Label className="text-base font-semibold">Quick cleanup</Label>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 max-w-[70%]">Trim long pauses so it flows better.</div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Shorten long pauses</span>
              <Switch checked={!!settings.removePauses} onCheckedChange={v=>update({ removePauses: v })} />
            </div>
          </div>
          {(() => {
            const maxP = settings.maxPauseSeconds ?? 1.5;
            const tgtP = settings.targetPauseSeconds ?? 0.5;
            const invalidPause = !!settings.removePauses && ((tgtP <= 0) || (maxP < tgtP));
            return (
              <div className={`space-y-2 ${!settings.removePauses ? 'opacity-60 pointer-events-none' : ''}`}>
                <div className="text-sm text-gray-700">
                  Pauses that are
                  <Input type="number" step="0.1" value={maxP} onChange={e=>update({ maxPauseSeconds: parseFloat(e.target.value||'1.5') })} className="inline-block w-20 mx-2" />
                  seconds or more will be condensed down to
                  <Input type="number" step="0.1" value={tgtP} onChange={e=>update({ targetPauseSeconds: parseFloat(e.target.value||'0.5') })} className="inline-block w-20 mx-2" />
                  seconds.
                </div>
                {invalidPause && (
                  <div className="text-xs text-red-600">Please choose numbers where “max” ≥ “condensed to”, and “condensed to” is greater than 0.</div>
                )}
              </div>
            );
          })()}
        </div>
        {/* Censor Beep */}
        <div className="space-y-4">
          <Label className="text-base font-semibold">Bleep out words</Label>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 max-w-[70%]">Pick words or phrases to bleep. Your transcript will show {`{beep}`}. Use our short built‑in beep or a sound from your library.</div>
            <Switch checked={!!settings.censorEnabled} onCheckedChange={v=>update({ censorEnabled: v })} />
          </div>
          {settings.censorEnabled && (
            <>
              <div>
                <Label className="text-xs text-gray-600">Words or phrases to bleep</Label>
                <TagInput values={settings.censorWords||[]} onChange={vals=>update({ censorWords: vals })} placeholder="Type word or phrase + Enter" />
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={!!settings.censorFuzzy} onCheckedChange={v=>update({ censorFuzzy: v })} />
                    <span className="text-sm text-gray-700">Catch near‑matches too</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-gray-600">How strict</Label>
                      <Input type="number" step="0.05" min="0" max="1" value={settings.censorMatchThreshold??0.8} onChange={e=>update({ censorMatchThreshold: parseFloat(e.target.value||'0.8') })} className="w-24" />
                    </div>
                    {(() => {
                      const v = Number(settings.censorMatchThreshold ?? 0.8);
                      let msg = 'Balanced: good at catching obvious matches.';
                      if (v <= 0.6) msg = 'Looser: bleeps more, may bleep close matches you didn’t intend.';
                      else if (v >= 0.9) msg = 'Stricter: bleeps less, may miss variations like endings or slang.';
                      return <span className="text-xs text-gray-600">{msg}</span>;
                    })()}
                  </div>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-600">Beep sound</Label>
                  {/** Radix Select disallows empty-string item values; use a sentinel and map */}
                  <Select
                    value={(settings.censorBeepFile && settings.censorBeepFile.trim()) ? settings.censorBeepFile : '__builtin__'}
                    onValueChange={(v)=> {
                      // Always enforce one short beep or single SFX play
                      if (v === '__builtin__') {
                        update({ censorBeepFile: '', censorBeepMs: BEEP_MS, censorBeepFreq: BEEP_FREQ, censorBeepGainDb: BEEP_GAIN_DB });
                      } else {
                        update({ censorBeepFile: v, censorBeepMs: BEEP_MS, censorBeepFreq: BEEP_FREQ, censorBeepGainDb: BEEP_GAIN_DB });
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Built‑in short beep (250ms)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__builtin__">Built‑in short beep (250ms)</SelectItem>
                      {sfxOptions.map(opt => (
                        <SelectItem key={opt.id} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-[12px] text-gray-600 mt-1">Upload SFX in Media Library (category “sfx”). We’ll play it once instead of the beep.</div>
                </div>
              </div>
            </>
          )}
        </div>
        {/* Filler Removal */}
        <div className="space-y-4">
          <Label className="text-base font-semibold">Filler words (optional)</Label>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 max-w-[70%]">Turn this on to remove common hesitation words (like “um”, “uh”). Add or remove any words you want to include.</div>
            <Switch checked={!!settings.removeFillers} onCheckedChange={v=>update({ removeFillers: v })} />
          </div>
          {settings.removeFillers && (
            <>
              <div>
                <Label className="text-xs text-gray-600">Words to remove</Label>
                <TagInput values={settings.fillerWords||[]} onChange={vals=>update({ fillerWords: vals })} placeholder="Type word + Enter" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs text-gray-600">Trim a tiny bit before each cut (ms)</Label>
                  <Input type="number" value={settings.fillerLeadTrimMs||0} onChange={e=>update({ fillerLeadTrimMs: parseInt(e.target.value||'0',10) })} />
                </div>
              </div>
            </>
          )}
        </div>
        {/* Magic Words (simple) */}
        <div className="space-y-4">
          <Label className="text-base font-semibold">Magic words (say these while recording)</Label>
          <div className="text-sm text-gray-600">You can rename these to whatever feels natural. Separate alternatives with commas.</div>
          <div className="text-xs bg-blue-50 border border-blue-200 text-blue-900 rounded p-3">
            Examples:
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li><span className="font-medium">Redo last bit</span>: say “flubber” (or your word) after a mistake. We’ll cut the mistake and restart that sentence.</li>
              <li><span className="font-medium">Ask your helper</span>: say “intern,” then your question. We’ll insert the answer in the next pause.</li>
            </ul>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Redo last bit (default: “flubber”)</Label>
              <Input
                value={(settings.commands?.flubber?.trigger_keyword) ?? 'flubber'}
                onChange={e=>updateCommand('flubber', { trigger_keyword: e.target.value })}
                placeholder="flubber, do‑over, go back"
              />
              <div className="text-[11px] text-gray-500">Say this to cut the mistake and restart that sentence.</div>
            </div>
            <div className="space-y-2">
              <div className="grid md:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Ask your helper (default: “intern”)</Label>
                  <Input
                    value={(settings.commands?.intern?.trigger_keyword) ?? 'intern'}
                    onChange={e=>updateCommand('intern', { trigger_keyword: e.target.value })}
                    placeholder="intern, sidekick, helper"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Stop phrase(s) next to it</Label>
                  <Input
                    value={(settings.commands?.intern?.end_markers || ['stop','stop intern']).join(', ')}
                    onChange={e=>{
                      const vals = tokenizeVariants(e.target.value);
                      updateCommand('intern', { end_markers: vals });
                    }}
                    placeholder="stop, stop intern"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-gray-500 pr-4">Say “intern,” then your request, then your stop phrase. We’ll anchor the answer at the stop and remove the spoken stop word.</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-700">Remove spoken stop</span>
                  <Switch checked={!!(settings.commands?.intern?.remove_end_marker ?? true)} onCheckedChange={v=>updateCommand('intern', { remove_end_marker: v })} />
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Optional: Create your own magic word (simple) */}
        <details className="rounded-md border bg-white/60">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Optional: make your own magic word</summary>
          <div className="p-3 space-y-4">
            <div className="text-sm text-gray-600">Add a phrase and choose what it does. Keep it simple.</div>
            <div className="space-y-3">
              {commandEntries.filter(([name]) => !['flubber','intern'].includes(name)).map(([name, cfg]) => {
                const variants = tokenizeVariants(cfg.trigger_keyword);
                return (
                  <div key={name} className="border rounded-md p-3 bg-gray-50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm" style={{ color:'#2C3E50' }}>{name}</div>
                      <Button size="icon" variant="ghost" className="text-gray-400 hover:text-red-600" onClick={()=>removeCommand(name)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-600">What you say</Label>
                      <Input value={cfg.trigger_keyword||''} onChange={e=>updateCommand(name,{ trigger_keyword: e.target.value })} placeholder="rim shot, drum hit" />
                      <div className="flex flex-wrap gap-1 mt-1">
                        {variants.map(v=> <Badge key={v} variant="secondary" className="text-xs bg-blue-600 text-white">{v}</Badge>)}
                      </div>
                      <Label className="text-xs text-gray-600 mt-2">What happens</Label>
                      <Input value={cfg.action||'sfx'} onChange={e=>updateCommand(name,{ action: e.target.value })} placeholder="sfx" />
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-2 items-center">
                <Input placeholder="new magic word name" value={newCommandName} onChange={e=>setNewCommandName(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); addCommand(); } }} />
                <Button type="button" variant="outline" onClick={addCommand} className="bg-transparent"><PlusCircle className="w-4 h-4 mr-1" />Add</Button>
              </div>
            </div>
          </div>
        </details>
        <div className="pt-2 flex justify-end"><Button size="sm" disabled={!dirty || saving} onClick={save} style={{ backgroundColor:'#2C3E50', color:'white' }}>{saving? 'Saving…':'Save Changes'}</Button></div>
      </CardContent>
    </Card>
  );
}

function TagInput({ values, onChange, placeholder }) {
  const [draft, setDraft] = useState('');
  const add = (val) => { const v = val.trim(); if(!v || values.includes(v)) return; onChange([...values, v]); setDraft(''); };
  const remove = v => onChange(values.filter(x=>x!==v));
  return (
    <div className="border rounded-md p-2 bg-white">
      <div className="flex flex-wrap gap-1 mb-1">
        {values.map(v=> <Badge key={v} variant="secondary" className="cursor-pointer bg-blue-600 text-white" onClick={()=>remove(v)}>{v} ×</Badge>)}
      </div>
      <Input value={draft} placeholder={placeholder} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); add(draft);} if(e.key==='Backspace' && !draft && values.length){ remove(values[values.length-1]); } }} />
    </div>
  );
}
