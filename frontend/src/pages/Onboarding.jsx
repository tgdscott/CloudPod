import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/AuthContext.jsx";
import OnboardingWrapper from "@/components/onboarding/OnboardingWrapper.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, Play, Pause } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useComfortPrefs } from "@/hooks/useComfortPrefs";
import { FORMATS, NO_MUSIC_OPTION } from "@/components/onboarding/OnboardingWizard.jsx";

export default function Onboarding() {
  const { token, user, refreshUser } = useAuth();
  const { toast } = useToast();
  const STEP_KEY = 'ppp.onboarding.step';
  // Restore step index on mount from localStorage
  const [stepIndex, setStepIndex] = useState(() => {
    try {
      const raw = localStorage.getItem(STEP_KEY);
      const n = raw != null ? parseInt(raw, 10) : 0;
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch {
      return 0;
    }
  });
  const stepSaveTimer = useRef(null);
  const { largeText, setLargeText, highContrast, setHighContrast } = useComfortPrefs();

  // Feature flag parity with modal wizard
  const ENABLE_BYOK = (import.meta.env?.VITE_ENABLE_BYOK === 'true');

  // Path selection: 'new' | 'import'
  const [path, setPath] = useState('new');

  // Local state mirrors NewUserWizard.jsx
  const [formData, setFormData] = useState({
    podcastName: '',
    podcastDescription: '',
    coverArt: null,
    elevenlabsApiKey: '',
  });
  const [isSpreakerConnected, setIsSpreakerConnected] = useState(false);
  const [saving, setSaving] = useState(false);

  // Additional state for richer flow
  const [formatKey, setFormatKey] = useState('solo');
  const [publishDay, setPublishDay] = useState('Monday');
  const [rssUrl, setRssUrl] = useState('');

  // Music assets
  const [musicAssets, setMusicAssets] = useState([NO_MUSIC_OPTION]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicChoice, setMusicChoice] = useState('none');
  const [musicPreviewing, setMusicPreviewing] = useState(null); // asset id
  const audioRef = useRef(null);
  // New scheduling states
  const [freqUnit, setFreqUnit] = useState('week'); // day | week | bi-weekly | month | year
  const [freqCount, setFreqCount] = useState(1);
  const [cadenceError, setCadenceError] = useState('');
  const [selectedWeekdays, setSelectedWeekdays] = useState([]); // e.g., ['Monday','Wednesday']
  const [selectedDates, setSelectedDates] = useState([]); // e.g., ['2025-09-10','2025-09-24']
  // Name capture (Step 1)
  const [firstName, setFirstName] = useState(() => (user?.first_name || ''));
  const [lastName, setLastName] = useState(() => (user?.last_name || ''));
  const [nameError, setNameError] = useState('');

  const wizardSteps = useMemo(() => {
    // Step 1: Get their name
    const nameStep = {
      id: 'yourName',
      title: 'What can we call you?',
      description: 'First name required; last name optional. You can update this later in Settings.',
      validate: async () => {
        const fn = (firstName || '').trim();
        const ln = (lastName || '').trim();
        if (!fn) { setNameError('First name is required'); return false; }
        setNameError('');
        try {
            const api = makeApi(token);
            await api.patch('/api/auth/users/me/prefs', { first_name: fn, last_name: ln || undefined });
          try { refreshUser?.({ force: true }); } catch {}
        } catch (_) { /* non-fatal */ }
        return true;
      },
      render: () => (
        <div className="grid gap-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="firstName" className="text-right">First name<span className="text-red-600">*</span></Label>
            <Input id="firstName" value={firstName} onChange={(e)=>setFirstName(e.target.value)} className="col-span-3" placeholder="e.g., Alex" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="lastName" className="text-right">Last name</Label>
            <Input id="lastName" value={lastName} onChange={(e)=>setLastName(e.target.value)} className="col-span-3" placeholder="(Optional)" />
          </div>
          {nameError && <p className="text-sm text-red-600">{nameError}</p>}
        </div>
      ),
    };

    // Step 2: Ask about existing podcast
    const choosePathStep = {
      id: 'choosePath',
      title: 'Do you have an existing podcast?',
      description: 'Start fresh or import an existing show.',
    };

  if (path === 'import') {
      const importSteps = [
    { id: 'rss', title: 'Import from RSS', description: 'Paste your feed URL.' },
    { id: 'confirm', title: 'Confirm import', description: 'We’ll mirror your setup and assets.' },
    { id: 'importing', title: 'Importing…', description: 'Fetching episodes and metadata.' },
    { id: 'analyze', title: 'Analyzing', description: 'We’ll bring over what we can—you can tidy later.' },
    { id: 'assets', title: 'Assets', description: 'We’ll bring over what we can—you can tidy later.' },
        { id: 'importSuccess', title: 'Imported', description: 'Your show is now in Podcast Pro Plus.' },
      ];
  // Import path after branching at Step 2
  return [...importSteps];
    }

    // Default: 'new' flow
    const newSteps = [
      // Step 1: Name
      nameStep,
      // Step 2: Choose path
      choosePathStep,
      // Step 3: About your show
      { id: 'showDetails', title: 'About your show', description: 'Tell us the name and what it’s about. You can change this later.' },
      { id: 'format', title: 'Format', description: 'How will most episodes feel?' },
      { id: 'coverArt', title: 'Cover art', description: 'Upload a square image (≥1400×1400). We’ll preview it.' },
      { id: 'music', title: 'Music (optional)', description: 'Pick intro/outro music (optional).' },
  { id: 'spreaker', title: 'Connect hosting (Spreaker)', description: 'Link your hosting so episodes can publish.' },
      // Step 8: Publish cadence
      { id: 'publishCadence', title: 'How often will you publish?', description: 'I want to publish X times every …' },
      // Step 9: Conditional schedule details
      { id: 'publishSchedule', title: 'Publishing days', description: 'Pick your publishing days/dates.' },
      { id: 'finish', title: 'Finish', description: 'Nice work. You can publish now or explore your dashboard.' },
    ];
    // Conditionally include publishSchedule (skip if unit is day or year)
    const includeSchedule = (freqUnit !== 'day' && freqUnit !== 'year');
    const withConditional = includeSchedule ? newSteps : newSteps.filter(s => s.id !== 'publishSchedule');
    return withConditional;
  }, [path, ENABLE_BYOK, firstName, lastName, nameError, freqUnit]);

  const stepId = wizardSteps[stepIndex]?.id;

  // If a query param requests a specific step (e.g., step=2), respect it on first mount
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    try {
      const url = new URL(window.location.href);
      const stepParam = url.searchParams.get('step');
      const n = stepParam != null ? parseInt(stepParam, 10) : NaN;
      if (Number.isFinite(n) && n >= 1) {
        // 1-based in the URL; clamp to available steps
        const clamped = Math.min(Math.max(1, n), wizardSteps.length) - 1;
        setStepIndex(clamped);
        // If jumping to step 2 (choosePath), we already have their name. Ensure path remains 'new'.
      }
    } catch {}
  }, [wizardSteps.length]);

  // Clamp restored step to bounds if env flags change shape
  useEffect(() => {
    const maxIndex = Math.max(0, wizardSteps.length - 1);
    if (stepIndex > maxIndex) setStepIndex(maxIndex);
  }, [wizardSteps.length]);

  // Debounce persist of current step index (≈350ms)
  useEffect(() => {
    if (stepSaveTimer.current) clearTimeout(stepSaveTimer.current);
    stepSaveTimer.current = setTimeout(() => {
      try { localStorage.setItem(STEP_KEY, String(stepIndex)); } catch {}
    }, 350);
    return () => { if (stepSaveTimer.current) clearTimeout(stepSaveTimer.current); };
  }, [stepIndex]);

  // When on the music step, fetch assets once
  useEffect(() => {
    if (stepId === 'music' && musicAssets.length <= 1 && !musicLoading) {
      setMusicLoading(true);
      (async () => {
        try {
          const api = makeApi(token);
          const data = await api.get('/api/music/assets');
          const assets = Array.isArray(data?.assets) ? data.assets : [];
          setMusicAssets([NO_MUSIC_OPTION, ...assets]);
        } catch (_) {
          setMusicAssets([NO_MUSIC_OPTION]);
        } finally {
          setMusicLoading(false);
        }
      })();
    }
    // cleanup preview when leaving music step
    if (stepId !== 'music' && audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      audioRef.current = null;
      setMusicPreviewing(null);
    }
  }, [stepId, musicAssets.length, musicLoading]);

  const togglePreview = (asset) => {
    if (!asset || asset.id === 'none') return;
    const url = asset.preview_url || asset.url || asset.filename;
    if (!url) return;
    // stop current
    if (musicPreviewing === asset.id) {
      try { audioRef.current?.pause(); } catch {}
      audioRef.current = null;
      setMusicPreviewing(null);
      return;
    }
    try {
      if (audioRef.current) { try { audioRef.current.pause(); } catch {} }
      const a = new Audio(url);
      audioRef.current = a;
      setMusicPreviewing(asset.id);
      const stopAt = 20; // seconds
      const onTick = () => {
        if (!a || isNaN(a.currentTime)) return;
        if (a.currentTime >= stopAt) {
          a.pause();
          setMusicPreviewing(null);
          a.removeEventListener('timeupdate', onTick);
        }
      };
      a.addEventListener('timeupdate', onTick);
      a.onended = () => { setMusicPreviewing(null); try { a.removeEventListener('timeupdate', onTick);} catch {} };
      a.play().catch(() => { setMusicPreviewing(null); });
    } catch {
      setMusicPreviewing(null);
    }
  };

  const handleChange = (e) => {
    const { id, value, files } = e.target;
    setFormData((prev) => ({ ...prev, [id]: files ? files[0] : value }));
  };

  async function handleConnectSpreaker() {
    try {
    const api = makeApi(token);
    const { auth_url } = await api.get('/api/spreaker/auth/login');
    if (!auth_url) throw new Error('Could not start the Spreaker sign-in.');
      const popup = window.open(auth_url, 'spreakerAuth', 'width=600,height=700');
      const timer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(timer);
          makeApi(token).get('/api/auth/users/me').then(user => { if (user?.spreaker_access_token) setIsSpreakerConnected(true); }).catch(()=>{});
        }
      }, 1000);
    } catch (error) {
      try { toast({ title: 'Connection Error', description: error.message, variant: 'destructive' }); } catch {}
    }
  }

  async function handleFinish() {
    try {
      setSaving(true);
      if (formData.elevenlabsApiKey) {
        try {
          await makeApi(token).put('/api/users/me/elevenlabs-key', { api_key: formData.elevenlabsApiKey });
        } catch {}
      }
      if (path === 'new') {
        const podcastPayload = new FormData();
        podcastPayload.append('name', formData.podcastName);
        podcastPayload.append('description', formData.podcastDescription);
        if (formData.coverArt) podcastPayload.append('cover_image', formData.coverArt);
        // Optionally include selected format/music/publishDay metadata in a future API

        const res = await makeApi(token).raw('/api/podcasts/', { method: 'POST', body: podcastPayload });
        if (!res || (res && res.status && res.status >= 400)) {
          let detail = '';
          try { detail = (res && res.detail) ? res.detail : JSON.stringify(res); } catch {}
          throw new Error(detail || 'Failed to create the podcast show.');
        }
        try { toast({ title: 'Success!', description: 'Your new podcast show has been created.' }); } catch {}
      } else {
        // Import path: nothing to create here; finishing just returns to dashboard
        try { toast({ title: 'Imported', description: 'Your show has been imported.' }); } catch {}
      }
      // Send user to dashboard in either case
      try { window.location.href = '/'; } catch {}
    } catch (error) {
      try { toast({ title: 'An Error Occurred', description: error.message, variant: 'destructive' }); } catch {}
    } finally {
      setSaving(false);
    }
  }

  // Map each stepId to a render function
  const steps = wizardSteps.map((s, i) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    tip: (
      s.id === 'yourName' ? 'We’ll use this to personalize your dashboard.' :
      s.id === 'choosePath' ? 'Not sure? You can switch paths at the top.' :
      s.id === 'showDetails' ? 'Short and clear works best.' :
      s.id === 'format' ? 'You can mix it up later.' :
      s.id === 'coverArt' ? 'No artwork yet? You can skip and add it later.' :
      s.id === 'music' ? 'Choose “No Music” to decide later.' :
      s.id === 'spreaker' ? 'Keep your phone nearby for codes.' :
      s.id === 'publishCadence' ? 'Bi-weekly always means once every two weeks.' :
      s.id === 'publishSchedule' ? 'Consistency beats volume.' :
      s.id === 'rss' ? 'Paste your feed URL.' :
      s.id === 'analyze' ? 'We’ll bring over what we can—you can tidy later.' :
      s.id === 'assets' ? 'We’ll bring over what we can—you can tidy later.' :
      s.id === 'finish' ? 'There’s a short tour next if you’d like it.' : ''
    ),
    render: () => {
      switch (s.id) {
        case 'yourName':
          return (
            <div className="grid gap-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="firstName" className="text-right">First name<span className="text-red-600">*</span></Label>
                <Input id="firstName" value={firstName} onChange={(e)=>setFirstName(e.target.value)} className="col-span-3" placeholder="e.g., Alex" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="lastName" className="text-right">Last name</Label>
                <Input id="lastName" value={lastName} onChange={(e)=>setLastName(e.target.value)} className="col-span-3" placeholder="(Optional)" />
              </div>
              {nameError && <p className="text-sm text-red-600">{nameError}</p>}
            </div>
          );
  case 'choosePath':
          return (
            <div className="space-y-4">
              <div className="flex gap-3">
                <Button
                  variant={path === 'new' ? 'default' : 'outline'}
                  onClick={() => { setPath('new'); setStepIndex(i + 1); }}
                >Start new</Button>
                <Button
                  variant={path === 'import' ? 'default' : 'outline'}
                  onClick={() => { setPath('import'); setStepIndex(0); }}
                >Import existing</Button>
              </div>
              <p className="text-sm text-muted-foreground">You can’t break anything. We save as you go.</p>
            </div>
          );
        case 'showDetails':
          return (
            <div className="grid gap-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="podcastName" className="text-right">Name</Label>
                <Input id="podcastName" value={formData.podcastName} onChange={handleChange} className="col-span-3" placeholder="e.g., 'The Morning Cup'" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="podcastDescription" className="text-right">Description</Label>
                <Textarea id="podcastDescription" value={formData.podcastDescription} onChange={handleChange} className="col-span-3" placeholder="e.g., 'A daily podcast about the latest tech news.'" />
              </div>
            </div>
          );
        case 'format':
          return (
            <div className="space-y-3">
              <div className="grid gap-3">
                {FORMATS.map(f => (
                  <label key={f.key} className={`border rounded p-3 cursor-pointer flex gap-3 ${formatKey===f.key? 'border-blue-600 ring-1 ring-blue-400':'hover:border-gray-400'}`}>
                    <input type="radio" name="format" className="mt-1" value={f.key} checked={formatKey===f.key} onChange={() => setFormatKey(f.key)} />
                    <span><span className="font-medium">{f.label}</span><br/><span className="text-xs text-muted-foreground">{f.desc}</span></span>
                  </label>
                ))}
              </div>
            </div>
          );
        case 'coverArt':
          return (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="coverArt" className="text-right">Image</Label>
              <Input id="coverArt" type="file" onChange={handleChange} className="col-span-3" accept="image/png, image/jpeg" />
            </div>
          );
        case 'music':
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {musicLoading ? 'Loading music…' : 'Pick a track or choose “No Music”.'}
              </div>
              <div className="grid gap-2">
                {musicAssets.map(a => {
                  const canPreview = !!(a && a.id !== 'none' && (a.preview_url || a.url || a.filename));
                  const isActive = musicChoice === a.id;
                  const isPreviewing = musicPreviewing === a.id;
                  return (
                    <div key={a.id} className={`flex items-center gap-3 p-2 rounded border ${isActive? 'border-blue-600 bg-blue-50':'bg-card hover:border-muted-foreground/30'}`}>
                      <button
                        type="button"
                        aria-label={isPreviewing? 'Pause preview':'Play preview'}
                        disabled={!canPreview}
                        onClick={() => canPreview && togglePreview(a)}
                        className={`inline-flex items-center justify-center h-8 w-8 rounded border ${isPreviewing? 'bg-blue-600 text-white border-blue-600':'bg-white text-foreground border-muted-foreground/30'} disabled:opacity-50`}
                        title={canPreview? 'Preview 20s':'Preview not available'}
                      >
                        {isPreviewing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                      <label className="flex items-center gap-3 flex-1 cursor-pointer">
                        <input type="radio" name="music" value={a.id} checked={isActive} onChange={() => setMusicChoice(a.id)} />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{a.display_name}</div>
                          {a.mood_tags && a.mood_tags.length > 0 && (
                            <div className="text-xs text-muted-foreground">{a.mood_tags.slice(0,3).join(', ')}</div>
                          )}
                        </div>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        case 'spreaker':
          return (
            <div className="flex justify-center items-center p-6 bg-accent/30 rounded-[var(--radius)]">
              {isSpreakerConnected ? (
                <Button variant="secondary" disabled className="bg-green-600 text-white hover:bg-green-600">
                  <CheckCircle className="w-5 h-5 mr-2" /> Connected
                </Button>
              ) : (
                <Button onClick={handleConnectSpreaker}>Connect to Spreaker</Button>
              )}
            </div>
          );
        
        case 'publishDay':
          return null;
        case 'publishCadence':
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm">I want to publish</span>
                <Input type="number" min={1} value={freqCount} onChange={(e)=> setFreqCount(Math.max(1, parseInt(e.target.value||'1',10) || 1))} className="w-20" />
                <span className="text-sm">times every</span>
                <select className="border rounded p-2" value={freqUnit} onChange={(e)=> setFreqUnit(e.target.value)}>
                  <option value="day">day</option>
                  <option value="week">week</option>
                  <option value="bi-weekly">bi-weekly</option>
                  <option value="month">month</option>
                  <option value="year">year</option>
                </select>
              </div>
              {cadenceError && <p className="text-sm text-red-600">{cadenceError}</p>}
              <p className="text-xs text-muted-foreground">We’ll tailor the next step based on this.</p>
            </div>
          );
        case 'publishSchedule':
          if (freqUnit === 'week') {
            const WEEKDAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
            const toggleDay = (d) => setSelectedWeekdays((prev)=> prev.includes(d) ? prev.filter(x=>x!==d) : [...prev, d]);
            return (
              <div className="space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {WEEKDAYS.map(d => (
                    <button type="button" key={d} onClick={()=>toggleDay(d)} className={`border rounded p-2 text-center ${selectedWeekdays.includes(d)?'border-blue-600 ring-1 ring-blue-400':'hover:border-gray-400'}`}>{d}</button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Pick your publishing day(s) of the week.</p>
              </div>
            );
          }
          // bi-weekly or month: simple two-month calendar picker
          const months = (()=>{
            const start = new Date();
            start.setDate(1);
            const next = new Date(start.getFullYear(), start.getMonth()+1, 1);
            return [start, next];
          })();
          const daysInMonth = (y,m)=> new Date(y, m+1, 0).getDate();
          const pad = (n)=> String(n).padStart(2,'0');
          const toggleDate = (iso)=> setSelectedDates((prev)=> prev.includes(iso) ? prev.filter(x=>x!==iso) : [...prev, iso]);
          // Sunday-first calendar headers
          const HEADERS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
          return (
            <div className="space-y-4">
              {months.map((m, idx)=>{
                const year = m.getFullYear();
                const month = m.getMonth();
                const total = daysInMonth(year, month);
                const first = new Date(year, month, 1);
                // JS: 0=Sun..6=Sat; convert to Monday-first (0..6)
                const jsFirst = first.getDay(); // 0=Sun..6=Sat
                const leadBlanks = jsFirst; // Sunday-first alignment
                const cells = [];
                for (let i=0;i<leadBlanks;i++) cells.push({ key: `b-${i}`, blank: true });
                for (let d=1; d<=total; d++) {
                  const iso = `${year}-${pad(month+1)}-${pad(d)}`;
                  cells.push({ key: iso, iso, day: d });
                }
                // Pad trailing blanks to complete the last week row
                while (cells.length % 7 !== 0) cells.push({ key: `t-${cells.length}`, blank: true });
                return (
                  <div key={idx} className="space-y-2">
                    <div className="font-medium text-sm">{m.toLocaleString(undefined,{ month:'long', year:'numeric' })}</div>
                    <div className="grid grid-cols-7 gap-1 text-[11px] text-muted-foreground">
                      {HEADERS.map(h => <div key={h} className="py-1 text-center">{h}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {cells.map(cell => {
                        if (cell.blank) return <div key={cell.key} className="p-2" />;
                        const active = selectedDates.includes(cell.iso);
                        return (
                          <button
                            type="button"
                            key={cell.key}
                            onClick={()=>toggleDate(cell.iso)}
                            className={`border rounded p-2 text-center text-xs ${active?'border-blue-600 ring-1 ring-blue-400':'hover:border-gray-400'}`}
                          >
                            {cell.day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">Pick your first publishing day(s); we’ll take it from there.</p>
            </div>
          );
        case 'finish':
          return (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Finish</h3>
              <p className="text-sm text-muted-foreground">Nice work. You can publish now or explore your dashboard.</p>
              {saving && <div className="text-xs text-muted-foreground">Working…</div>}
            </div>
          );
        // Import flow renders
        case 'rss':
          return (
            <div className="grid gap-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="rssUrl" className="text-right">RSS URL</Label>
                <Input id="rssUrl" value={rssUrl} onChange={(e)=> setRssUrl(e.target.value)} className="col-span-3" placeholder="https://example.com/feed.xml" />
              </div>
            </div>
          );
        case 'confirm':
          return (
            <div className="space-y-3">
              <p className="text-sm">We’ll import episodes and assets from:</p>
              <div className="p-3 rounded border bg-accent/30 text-sm break-all">{rssUrl || '—'}</div>
              <p className="text-xs text-muted-foreground">Click Continue to start the import.</p>
            </div>
          );
        case 'importing':
          return (<div className="text-sm">Importing… This may take a moment.</div>);
        case 'analyze':
          return (<div className="text-sm">Analyzing your feed and extracting settings…</div>);
        case 'assets':
          return (<div className="text-sm">Pulling cover art and audio assets…</div>);
        case 'importSuccess':
          return (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Imported</h3>
              <p className="text-sm text-muted-foreground">Your show is in Podcast Pro Plus. Explore your episodes on the dashboard.</p>
            </div>
          );
        default:
          return null;
      }
    },
  // Keep validations lenient: prefer step-provided validate, then intercept where needed
  validate: s.validate ? s.validate : s.id === 'publishCadence' ? async () => {
      if (freqUnit === 'bi-weekly' && Number(freqCount) !== 1) {
        setCadenceError('For bi-weekly, X must be 1.');
        return false;
      }
      setCadenceError('');
      return true;
    } : s.id === 'confirm' && path === 'import' ? async () => {
      // Start import on Continue
      try {
        if (!rssUrl) return true; // lenient: allow moving forward even if blank
        try { await makeApi(token).post('/api/import/rss', { rss_url: rssUrl.trim() }); } catch {}
      } catch {}
      return true;
    } : undefined,
  }));

  // Auto-advance simple import progress steps
  useEffect(() => {
    let t;
    if (path === 'import') {
      if (stepId === 'importing') {
        t = setTimeout(() => setStepIndex((n) => Math.min(n + 1, wizardSteps.length - 1)), 1000);
      } else if (stepId === 'analyze') {
        t = setTimeout(() => setStepIndex((n) => Math.min(n + 1, wizardSteps.length - 1)), 800);
      } else if (stepId === 'assets') {
        t = setTimeout(() => setStepIndex((n) => Math.min(n + 1, wizardSteps.length - 1)), 800);
      }
    }
    return () => { if (t) clearTimeout(t); };
  }, [path, stepId, wizardSteps.length]);

  return (
    <OnboardingWrapper
      steps={steps}
      index={stepIndex}
      setIndex={setStepIndex}
      onComplete={handleFinish}
      prefs={{ largeText, setLargeText, highContrast, setHighContrast }}
      greetingName={firstName?.trim() || ''}
    />
  );
}
