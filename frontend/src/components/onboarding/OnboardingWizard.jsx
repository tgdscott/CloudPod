import React, { useState, useEffect } from 'react';
import { useAuth } from '@/AuthContext.jsx';
import { makeApi, buildApiUrl } from '@/lib/apiClient';

// Restored: podcast format options (removed accidentally in earlier patch)
export const FORMATS = [
  { key: 'solo', label: 'Solo Monologue', desc: 'You sharing insights, tips, or stories.' },
  { key: 'interview', label: 'Interview', desc: 'You interviewing a different guest each episode.' },
  { key: 'cohost', label: 'Co-Hosts', desc: 'Conversational show with a consistent co-host.' },
  { key: 'panel', label: 'Panel / Roundtable', desc: 'Group discussion with multiple recurring voices.' },
  { key: 'narrative', label: 'Narrative / Story', desc: 'Scripted or documentary style storytelling.' },
];

// Dynamic music assets (Phase 1): fetched from backend; retains a "no music" option.
export const NO_MUSIC_OPTION = { id: 'none', display_name: 'No Music', mood_tags: [] };

export default function OnboardingWizard(){
  const { token } = useAuth();
  // Branch selection
  const [mode, setMode] = useState(null); // null | 'new' | 'import'

  // NEW PODCAST path step machine (string-based for clarity)
  const NEW_STEPS = [
    'userName',
    'haveNameQuestion',
    'brainstorm',
    'name',
    'description',
    'format',
    'category',
    'audience',
    'cover',
    'audioSetup',
    'spreaker',
    'lastInfo',
    'distribution',
    'reviewCreate',
    'success'
  ];
  const [newStep, setNewStep] = useState(NEW_STEPS[0]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // IMPORT path steps
  const IMPORT_STEPS = ['rss', 'confirm', 'importing', 'analyze', 'assets', 'importSuccess'];
  const [importStep, setImportStep] = useState(IMPORT_STEPS[0]);

  // --- Shared state for new path ---
  const [topicsText, setTopicsText] = useState('');
  const [nameSuggestions, setNameSuggestions] = useState([]);
  const [podcastName, setPodcastName] = useState('');
  const [description, setDescription] = useState('');
  const [formatKey, setFormatKey] = useState('solo');
  const [categories, setCategories] = useState([]); // fetched objects {category_id, name}
  const [catLoading, setCatLoading] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]); // up to 3 ids
  const [audience, setAudience] = useState('');
  // voiceover selection removed
  const [musicChoice, setMusicChoice] = useState('none');
  const [introMode, setIntroMode] = useState('none');
  const [outroMode, setOutroMode] = useState('none');
  const [introFile, setIntroFile] = useState(null);
  const [outroFile, setOutroFile] = useState(null);
  const [introScript, setIntroScript] = useState('');
  const [outroScript, setOutroScript] = useState('');
  const [coverMode, setCoverMode] = useState('later');
  const [coverFile, setCoverFile] = useState(null);
  // Music assets (Phase 1)
  const [musicAssets, setMusicAssets] = useState([]); // fetched list
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicPreviewing, setMusicPreviewing] = useState(null); // asset id currently playing
  const audioRef = React.useRef(null);
  const [spreakerSaved, setSpreakerSaved] = useState(false);
  const [spreakerShows, setSpreakerShows] = useState([]);
  const [spreakerLoading, setSpreakerLoading] = useState(false);
  const [spreakerPhase, setSpreakerPhase] = useState('intro'); // intro | token | status
  const [spreakerVerifying, setSpreakerVerifying] = useState(false); // after popup closes we verify token
  const [spreakerConnectError, setSpreakerConnectError] = useState(null); // specific to connect flow
  const [showInfo, setShowInfo] = useState(null); // remote mapped show info after creation
  const [showInfoLoading, setShowInfoLoading] = useState(false);
  const [showInfoError, setShowInfoError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [createdPodcast, setCreatedPodcast] = useState(null);
  const [rssUrl, setRssUrl] = useState(''); // import path
  const [importResult, setImportResult] = useState(null);
  const [importFormatDescription, setImportFormatDescription] = useState('');
  const [importAssets, setImportAssets] = useState([]);

  function nextNew(stepName){
    const idx = NEW_STEPS.indexOf(stepName ?? newStep);
    if(idx >=0 && idx < NEW_STEPS.length-1) setNewStep(NEW_STEPS[idx+1]);
  }
  function prevNew(){
    const idx = NEW_STEPS.indexOf(newStep);
    if(idx>0) setNewStep(NEW_STEPS[idx-1]);
  }

  function nextImport(){
    const idx = IMPORT_STEPS.indexOf(importStep);
    if(idx>=0 && idx < IMPORT_STEPS.length-1) setImportStep(IMPORT_STEPS[idx+1]);
  }

  async function saveUserNames(){
    try {
      await makeApi(token).patch('/api/auth/users/me/prefs', { first_name:firstName, last_name:lastName });
    } catch {}
  }
  function prevImport(){
    const idx = IMPORT_STEPS.indexOf(importStep);
    if(idx>0) setImportStep(IMPORT_STEPS[idx-1]);
  }

  // Fetch Spreaker categories early (when entering new flow)
  useEffect(()=>{
    if(mode==='new' && categories.length===0 && !catLoading){
      setCatLoading(true);
      (async ()=>{
        try {
          const data = await makeApi(token).get('/api/spreaker/categories');
          const items = data?.categories || [];
          setCategories(items.map(it=>({ id: it.category_id || it.id || it.value, name: it.name || it.description || it.label || it.title })));
        } catch {}
        finally { setCatLoading(false); }
      })();
    }
  }, [mode, categories.length, catLoading]);

  function toggleCategory(id){
    setSelectedCategories(prev => {
      if(prev.includes(id)) return prev.filter(c=>c!==id);
      if(prev.length>=3) return prev; // max 3
      return [...prev, id];
    });
  }

  function generateNameIdeas(){
    const baseTerms = topicsText.split(/[\n,]/).map(t=>t.trim()).filter(Boolean).slice(0,4);
    const ideas = [];
    baseTerms.forEach(t=>{
      const core = t.split(' ').slice(0,2).map(w=> w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ');
      ideas.push(`The ${core} Show`);
      ideas.push(`${core} Conversations`);
    });
    if(ideas.length===0) ideas.push('Your Next Big Podcast');
    setNameSuggestions([...new Set(ideas)].slice(0,6));
  }

  // Auto-save names when both present and on leaving step
  useEffect(()=>{ if(newStep !== 'userName' && firstName){ saveUserNames(); } // fire once leaving
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newStep]);

  // Fetch curated music assets once when reaching audioSetup step
  useEffect(()=>{
    if(newStep==='audioSetup' && musicAssets.length===0 && !musicLoading){
      setMusicLoading(true);
      (async ()=>{
        try { const data = await makeApi(token).get('/api/music/assets'); setMusicAssets([NO_MUSIC_OPTION, ...(data.assets||[])]); } catch { setMusicAssets([NO_MUSIC_OPTION]); } finally { setMusicLoading(false); }
      })();
    }
  }, [newStep, musicAssets.length, musicLoading]);

  function togglePreview(asset){
    if(asset.id==='none') return;
    if(musicPreviewing === asset.id){
      // stop
      if(audioRef.current){ audioRef.current.pause(); audioRef.current = null; }
      setMusicPreviewing(null);
      return;
    }
    // start new
    try {
      if(audioRef.current){ audioRef.current.pause(); }
      const a = new Audio(asset.preview_url || asset.filename);
      audioRef.current = a;
      setMusicPreviewing(asset.id);
      a.onended = ()=> setMusicPreviewing(prev => prev===asset.id? null: prev);
      a.play().catch(()=>{ setMusicPreviewing(null); });
    } catch { setMusicPreviewing(null); }
  }

  async function handleSelectMusic(asset){
    setMusicChoice(asset.id);
    if(asset.id !== 'none'){
      try { await fetch(buildApiUrl(`/api/music/assets/${asset.id}/select`), { method:'POST', headers:{ Authorization:`Bearer ${token}` }}); } catch {}
    }
  }

  function isNameValid(name){
    if(!name) return false;
    if(name.trim().length < 4) return false;
    const first = name.trim().charAt(0);
    if(first !== first.toUpperCase() || !/[A-Z]/.test(first)) return false;
    return true;
  }

  // legacy saveSpreaker removed (OAuth flow replaces manual token)

  async function fetchSpreakerShows({ verify=false }={}){
  setSpreakerLoading(true);
    if(verify){ setSpreakerVerifying(true); }
    setSpreakerConnectError(null);
    try {
  const data = await makeApi(token).get('/api/spreaker/shows');
  setSpreakerShows(data?.shows || []);
      setSpreakerSaved(true); // success => mark connected
    } catch(e){
      // failed verification => allow retry
      setSpreakerSaved(false);
      setSpreakerShows([]);
      if(verify) setSpreakerConnectError('Spreaker connection failed. Please try again.');
    } finally {
      setSpreakerLoading(false);
      if(verify){ setSpreakerVerifying(false); }
    } }

  async function disconnectSpreaker(){
  try { await makeApi(token).post('/api/spreaker/disconnect'); } catch {}
    setSpreakerSaved(false);
    setSpreakerShows([]);
    setSpreakerConnectError(null);
  }

  async function refreshRss(){
    if(!createdPodcast) return;
    setShowInfoLoading(true); setShowInfoError(null);
    try {
  const r = await makeApi(token).raw(`/api/spreaker/refresh/${createdPodcast.id}`, { method:'POST' });
  if(r && r.status && r.status >= 400) throw new Error('Refresh failed');
      // refetch full show info after refresh
      await loadRemoteShow();
    } catch(e){ setShowInfoError(e.message);} finally { setShowInfoLoading(false);} }

  async function loadRemoteShow(){
    if(!createdPodcast) return;
    setShowInfoLoading(true); setShowInfoError(null);
    try {
      try {
        const data = await makeApi(token).get(`/api/spreaker/show/${createdPodcast.id}?mapped=true`);
        setShowInfo(data?.mapped || null);
      } catch (e) { throw new Error('Could not load remote show'); }
    } catch(e){ setShowInfoError(e.message);} finally { setShowInfoLoading(false);} }

  async function handleCreateAndTemplate(){
    setSaving(true); setError(null);
    try {
      // create podcast only once
      let podcast = createdPodcast;
      if(!podcast){
        const fd = new FormData();
        fd.append('name', podcastName);
        fd.append('description', description || '');
        if(coverMode==='upload' && coverFile){
          fd.append('cover_image', coverFile);
        }
  // Map first three selected categories to category_id / category_2_id / category_3_id after creation via update
  const podRes = await makeApi(token).raw('/api/podcasts/', { method:'POST', body: fd });
        if (podRes && podRes.status && podRes.status >= 400) {
          let detail='';
          try { detail = podRes.detail || JSON.stringify(podRes); } catch {}
          throw new Error('Podcast create failed '+detail);
        }
        podcast = podRes;
        setCreatedPodcast(podcast);
      }
      const podcastId = podcast.id || podcast.podcast_id || podcast.uuid;
      // If we have categories selected beyond basic create (create endpoint currently only takes name/description/cover)
      if(selectedCategories.length){
        try {
          const body = {
            category_id: selectedCategories[0] || null,
            category_2_id: selectedCategories[1] || null,
            category_3_id: selectedCategories[2] || null,
          };
          await fetch(buildApiUrl(`/api/podcasts/${podcastId}`), { method:'PUT', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify(body) });
        } catch{}
      }

      // Upload intro/outro
      let introFilename=null, outroFilename=null;
        try { if(introMode==='upload' && introFile){ const fd=new FormData(); fd.append('files', introFile); const r=await makeApi(token).raw('/api/media/upload/intro',{method:'POST',body:fd}); if(r && Array.isArray(r) && r[0]) { introFilename=r[0]?.filename; } } } catch{}
      try { if(outroMode==='upload' && outroFile){ const fd=new FormData(); fd.append('files', outroFile); const r=await makeApi(token).raw('/api/media/upload/outro',{method:'POST',body:fd}); if(r && Array.isArray(r) && r[0]) { outroFilename=r[0]?.filename; } } } catch{}
      // Build segments
      const segments=[];
      if(introMode==='upload' && introFilename) segments.push({ segment_type:'intro', source:{ source_type:'static', filename:introFilename } });
      else if(introMode==='script' && introScript.trim()) segments.push({ segment_type:'intro', source:{ source_type:'tts', script:introScript.trim(), voice_id:'default' } });
      segments.push({ segment_type:'content', source:{ source_type:'tts', script:'', voice_id:'default' } });
      if(outroMode==='upload' && outroFilename) segments.push({ segment_type:'outro', source:{ source_type:'static', filename:outroFilename } });
      else if(outroMode==='script' && outroScript.trim()) segments.push({ segment_type:'outro', source:{ source_type:'tts', script:outroScript.trim(), voice_id:'default' } });
      const templateBody = { podcast_id:podcastId, name:'Default Episode', segments, background_music_rules:[], timing:{} };
  try { await makeApi(token).post('/api/templates/', templateBody); } catch{}
      // If Spreaker token provided, attempt to load remote show info (creation attempted server-side)
      if(spreakerSaved){
        // slight delay to allow backend to create remote show
        setTimeout(()=>{ loadRemoteShow(); }, 600);
      }
      setNewStep('success');
    } catch(e){ setError(e.message);} finally { setSaving(false);} }

  // --- Import path actions ---
  async function handleImportRss(){
    setError(null);
    try {
      const resp = await makeApi(token).post('/api/import/rss', { rss_url: rssUrl.trim() });
        if(resp && resp.status === 409){ setError('Already imported.'); return; }
        const data = resp;
      setImportResult(data);
      setImportStep('importing');
      setTimeout(()=> setImportStep('analyze'), 1200); // simulate progress
    } catch(e){ setError(e.message); }
  }

  // --- Branch selection screen ---
  if(!mode){
    return (
  <main className="max-w-xl mx-auto py-12" role="main" aria-label="Onboarding main content" tabIndex={-1}>
        <h1 className="text-3xl font-bold mb-4">We’ll guide you one step at a time.</h1>
        <p className="text-gray-600 mb-8">Do you already have a podcast? You can’t break anything, and we save as you go.</p>
        <div className="flex flex-col gap-4">
          <button onClick={()=>setMode('new')} className="px-6 py-4 bg-blue-600 text-white rounded text-left">
            <span className="font-semibold block">I’m starting fresh</span>
            <span className="text-sm">We’ll help you set things up and create a starter template.</span>
          </button>
          <button onClick={()=>setMode('import')} className="px-6 py-4 bg-white border rounded text-left hover:shadow">
            <span className="font-semibold block">I already have a show</span>
            <span className="text-sm text-gray-600">Import your feed and we’ll mirror your setup.</span>
          </button>
        </div>
      </main>
    );
  }

  // --- NEW PODCAST PATH ---
  if(mode==='new'){
    if(newStep==='success') return (
      <div className="max-w-xl mx-auto py-12">
  <h1 className="text-3xl font-bold mb-4 text-center">All set</h1>
        <p className="mb-6 text-center">Your podcast, "{podcastName}" and first template are ready.</p>
        {spreakerSaved && (
          <div className="mb-6 p-4 border rounded bg-white/50">
            <h2 className="text-lg font-semibold mb-2">Spreaker Show Status</h2>
            {!showInfo && !showInfoLoading && (
              <button onClick={loadRemoteShow} className="px-3 py-2 bg-blue-600 text-white rounded text-sm">Load Remote Show Info</button>
            )}
            {showInfoLoading && <div className="text-sm text-gray-600">Loading...</div>}
            {showInfoError && <div className="text-sm text-red-600 mb-2">{showInfoError}</div>}
            {showInfo && (
              <div className="text-sm space-y-1">
                <div><strong>Spreaker Show ID:</strong> {showInfo.spreaker_show_id || '—'}</div>
                <div><strong>RSS URL:</strong> {showInfo.rss_url_locked || showInfo.rss_url || 'Pending generation'}</div>
                <div><strong>Title:</strong> {showInfo.name}</div>
                <div><strong>Description:</strong> {(showInfo.description||'').slice(0,140) + (showInfo.description && showInfo.description.length>140?'…':'')}</div>
                <div className="pt-2 flex gap-2">
                  <button disabled={showInfoLoading} onClick={loadRemoteShow} className="px-3 py-1 bg-gray-100 rounded text-xs">Refresh Info</button>
                  <button disabled={showInfoLoading} onClick={refreshRss} className="px-3 py-1 bg-gray-100 rounded text-xs">Force RSS Check</button>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="text-center">
          <a href="/" className="px-6 py-3 bg-blue-600 text-white rounded inline-block">Go to Dashboard</a>
        </div>
      </div>
    );
    return (
      <div className="max-w-2xl mx-auto py-10">
  <h1 className="text-2xl font-bold mb-4">Create your podcast</h1>
        {error && <div className="mb-4 p-3 text-sm bg-red-100 text-red-700 rounded">{error}</div>}
        {/* Steps */}
        {newStep==='userName' && (
          <div>
            <h2 className="text-xl font-semibold mb-3">What should we call you?</h2>
            <p className="text-sm text-gray-600 mb-4">Optional. We’ll use this in your dashboard.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wide">First Name</label>
                <input value={firstName} onChange={e=>setFirstName(e.target.value)} className="w-full border rounded p-2" placeholder="Jane" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wide">Last Name</label>
                <input value={lastName} onChange={e=>setLastName(e.target.value)} className="w-full border rounded p-2" placeholder="Doe" />
              </div>
            </div>
            <div className="flex gap-3">
              <button disabled={!firstName} onClick={()=>{ saveUserNames(); setNewStep('haveNameQuestion'); }} className={`px-5 py-3 rounded text-white ${firstName? 'bg-blue-600 hover:bg-blue-500':'bg-gray-400 cursor-not-allowed'}`}>Continue</button>
              <button onClick={()=> setNewStep('haveNameQuestion')} className="px-5 py-3 border rounded">Skip</button>
            </div>
          </div>
        )}
        {newStep==='haveNameQuestion' && (
          <div>
            <h2 className="text-xl font-semibold mb-3">Do you already have a show name?</h2>
            <p className="text-sm text-gray-600 mb-6">If not, we can show ideas.</p>
            <div className="flex flex-col gap-4">
              <button onClick={()=> setNewStep('name')} className="px-5 py-3 bg-blue-600 text-white rounded">Yes</button>
              <button onClick={()=> setNewStep('brainstorm')} className="px-5 py-3 bg-white border rounded hover:shadow">Show me ideas</button>
            </div>
          </div>
        )}
        {newStep==='brainstorm' && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Name ideas</h2>
            <p className="text-sm text-gray-600 mb-3">Tell us what your show is about.</p>
            <textarea rows={4} className="w-full border rounded p-3 mb-4" value={topicsText} onChange={e=>setTopicsText(e.target.value)} placeholder="AI for small business, remote work productivity, interviews with founders..." />
            <div className="flex gap-2 mb-4">
              <button onClick={generateNameIdeas} className="px-4 py-2 bg-blue-600 text-white rounded">See ideas</button>
              <button onClick={()=> setNewStep('haveNameQuestion')} className="px-4 py-2 border rounded">Back</button>
            </div>
            {nameSuggestions.length>0 && (
              <div className="mb-4">
                <h3 className="font-medium mb-2">Suggestions</h3>
                <div className="flex flex-wrap gap-2">
                  {nameSuggestions.map(n=> <button key={n} onClick={()=>{ setPodcastName(n); setNewStep('name'); }} className="px-3 py-2 border rounded text-sm hover:bg-blue-50">{n}</button>)}
                </div>
              </div>
            )}
          </div>
        )}
        {newStep==='name' && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Show title</h2>
            <input
              className={`w-full border rounded p-3 mb-2 ${podcastName && !isNameValid(podcastName)?'border-red-500':''}`}
              value={podcastName}
              onChange={e=>setPodcastName(e.target.value)}
              placeholder="Your show title" />
            {podcastName && !isNameValid(podcastName) && (
              <div className="text-xs text-red-600 mb-2">
                Use at least 4 characters and start with a capital letter.
              </div>
            )}
            <NavButtons
              onBack={()=> setNewStep('haveNameQuestion')}
              onNext={()=> setNewStep('description')}
              nextDisabled={!podcastName || !isNameValid(podcastName)}
            />
          </div>
        )}
        {newStep==='description' && (
          <div>
            <h2 className="text-xl font-semibold mb-2">About your show</h2>
            <textarea rows={4} className="w-full border rounded p-3 mb-4" value={description} onChange={e=>setDescription(e.target.value)} placeholder="In a sentence or two, what is your show about?" />
            <NavButtons onBack={()=> setNewStep('name')} onNext={()=> setNewStep('format')} />
          </div>
        )}
        {newStep==='format' && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Pick a format</h2>
            <div className="grid gap-3 mb-4">
              {FORMATS.map(f => (
                <label key={f.key} className={`border rounded p-3 cursor-pointer flex gap-3 ${formatKey===f.key? 'border-blue-600 ring-1 ring-blue-400':'hover:border-gray-400'}`}>
                  <input type="radio" name="format" className="mt-1" value={f.key} checked={formatKey===f.key} onChange={()=>setFormatKey(f.key)} />
                  <span><span className="font-medium">{f.label}</span><br/><span className="text-xs text-gray-600">{f.desc}</span></span>
                </label>
              ))}
            </div>
            <NavButtons onBack={()=> setNewStep('description')} onNext={()=> setNewStep('category')} />
          </div>
        )}
        {newStep==='category' && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Categories</h2>
            <p className="text-sm text-gray-600 mb-3">Choose up to 3 categories that best fit your show.</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {(catLoading? CATEGORY_PLACEHOLDER : categories).map(c => (
                <button key={c.id||c} onClick={()=>!catLoading && toggleCategory(c.id||c)}
                  className={`px-3 py-2 rounded border text-xs ${selectedCategories.includes(c.id||c)?'bg-blue-600 text-white border-blue-600':'bg-gray-100 hover:bg-gray-200'}`}>{c.name||c}</button>
              ))}
            </div>
            <div className="text-xs text-gray-500 mb-4">{selectedCategories.length}/3 selected</div>
            <NavButtons onBack={()=> setNewStep('format')} onNext={()=> setNewStep('audience')} nextDisabled={selectedCategories.length===0} />
          </div>
        )}
        {newStep==='audience' && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Who’s it for?</h2>
            <textarea rows={4} className="w-full border rounded p-3 mb-4" value={audience} onChange={e=>setAudience(e.target.value)} placeholder="Beginners interested in ..." />
            <NavButtons onBack={()=> setNewStep('category')} onNext={()=> setNewStep('cover')} />
          </div>
        )}
  {newStep==='cover' && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Cover art</h2>
            <div className="flex flex-col gap-2 mb-3">
              <label className={`border rounded p-2 cursor-pointer ${coverMode==='upload'?'border-blue-600':'hover:border-gray-400'}`}>
                <input type="radio" name="cover" className="mr-2" checked={coverMode==='upload'} onChange={()=>setCoverMode('upload')} />Upload my own image
              </label>
              <label className={`border rounded p-2 cursor-pointer ${coverMode==='help'?'border-blue-600':'hover:border-gray-400'}`}>
                <input type="radio" name="cover" className="mr-2" checked={coverMode==='help'} onChange={()=>setCoverMode('help')} />Help me create one (coming soon)
              </label>
              <label className={`border rounded p-2 cursor-pointer ${coverMode==='later'?'border-blue-600':'hover:border-gray-400'}`}>
                <input type="radio" name="cover" className="mr-2" checked={coverMode==='later'} onChange={()=>setCoverMode('later')} />I'll do this later
              </label>
            </div>
            {coverMode==='upload' && <input type="file" accept="image/*" onChange={e=>setCoverFile(e.target.files?.[0]||null)} />}
            <NavButtons onBack={()=> setNewStep('audience')} onNext={()=> setNewStep('audioSetup')} />
          </div>
        )}
    {newStep==='audioSetup' && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Audio setup</h2>
      <p className="text-sm text-gray-600 mb-4">Optional: background music and intro/outro. You can skip this for now.</p>
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div>
                <h3 className="font-medium mb-2">Intro & Outro (Optional)</h3>
                <div className="mb-4">
                  <label className="block text-xs font-semibold mb-1">Intro</label>
                  <select className="w-full border rounded p-2 mb-2" value={introMode} onChange={e=>setIntroMode(e.target.value)}>
                    <option value="none">No intro (add later)</option>
                    <option value="upload">I already have a produced intro file</option>
                    <option value="script">Write a script for an AI-read intro</option>
                  </select>
                  {introMode==='upload' && <input type="file" accept="audio/*" onChange={e=>setIntroFile(e.target.files?.[0]||null)} className="text-sm" />}
                  {introMode==='script' && <textarea rows={3} className="w-full border rounded p-2 text-sm" value={introScript} placeholder="Welcome to..." onChange={e=>setIntroScript(e.target.value)} />}
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Outro</label>
                  <select className="w-full border rounded p-2 mb-2" value={outroMode} onChange={e=>setOutroMode(e.target.value)}>
                    <option value="none">No outro (add later)</option>
                    <option value="upload">I already have a produced outro file</option>
                    <option value="script">Write a script for an AI-read outro</option>
                  </select>
                  {outroMode==='upload' && <input type="file" accept="audio/*" onChange={e=>setOutroFile(e.target.files?.[0]||null)} className="text-sm" />}
                  {outroMode==='script' && <textarea rows={3} className="w-full border rounded p-2 text-sm" value={outroScript} placeholder="Thanks for listening..." onChange={e=>setOutroScript(e.target.value)} />}
                </div>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">Background Music {musicLoading && <span className="text-xs text-gray-400">Loading…</span>}</h3>
                <div className="flex flex-col gap-2 mb-2">
                  {musicAssets.map(a => (
                    <div key={a.id} className={`flex items-center gap-2 p-2 rounded border ${musicChoice===a.id?'border-blue-600 bg-blue-50':'bg-white hover:border-gray-300'}`}>
                      <button type="button" onClick={()=>togglePreview(a)} disabled={a.id==='none'} className={`w-7 h-7 text-xs rounded border ${musicPreviewing===a.id?'bg-red-600 text-white border-red-600':'bg-gray-100 hover:bg-gray-200'}`}>{musicPreviewing===a.id? '■':'▶'}</button>
                      <button type="button" onClick={()=>handleSelectMusic(a)} className={`flex-1 text-left text-xs ${musicChoice===a.id?'font-semibold':''}`}>{a.display_name}</button>
                      {a.mood_tags && a.mood_tags.length>0 && <span className="hidden md:inline text-[10px] text-gray-500">{a.mood_tags.slice(0,3).join(', ')}</span>}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500">We’ll expand this with AI-generated suggestions soon.</p>
              </div>
            </div>
            <NavButtons onBack={()=> setNewStep('cover')} onNext={()=> setNewStep('spreaker')} />
          </div>
        )}
        {newStep==='spreaker' && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Connect hosting (Spreaker)</h2>
            {!spreakerSaved && (
              <div className="space-y-4 text-sm text-gray-700 mb-4">
                <p>Sign in to Spreaker so we can set up your show and publish for you.</p>
                <button
                    onClick={async () => {
                    try {
                      const data = await makeApi(token).get('/api/spreaker/auth/login');
                      const auth_url = data && data.auth_url;
                      if(!auth_url) throw new Error('Auth init failed');
                      window.open(auth_url, 'spreakerOAuth', 'width=720,height=800');
                      const handler = (ev) => {
                        if(ev.data === 'spreaker_connected' || (ev.data && ev.data.type==='spreaker_connected')){
                          window.removeEventListener('message', handler);
                          // Verify server actually stored token before marking connected
                          fetchSpreakerShows({ verify:true });
                        }
                      };
                      window.addEventListener('message', handler);
                    } catch(e){ setError("Couldn't start the Spreaker sign-in"); }
                  }}
                  className="px-5 py-2 bg-blue-600 text-white rounded"
                >Sign in to Spreaker</button>
                {spreakerVerifying && <div className="text-xs text-gray-500">Verifying connection…</div>}
                {spreakerConnectError && (
                  <div className="text-xs text-red-600 flex items-center gap-2">
                    <span>{spreakerConnectError}</span>
                    <button onClick={()=>{
                      setSpreakerConnectError(null);
                      // allow starting over
                    }} className="underline">Reset</button>
                  </div>
                )}
                {/* Removed skip option: Spreaker connection is required for the current flow */}
              </div>
            )}
            {spreakerSaved && (
              <div className="space-y-3 mb-4 text-sm">
                <div className="p-2 bg-green-100 text-green-700 rounded text-xs inline-block">Connected</div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={disconnectSpreaker} className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">Disconnect</button>
                  <button onClick={()=> setNewStep('lastInfo')} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Continue</button>
                </div>
              </div>
            )}
            {!spreakerSaved && <NavButtons onBack={()=> setNewStep('audioSetup')} nextDisabled={true} />}
            {spreakerSaved && <NavButtons onBack={()=> setNewStep('audioSetup')} onNext={()=> setNewStep('lastInfo')} />}
          </div>
        )}
        {newStep==='lastInfo' && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Final details</h2>
            <p className="text-sm text-gray-600 mb-4">We'll collect any remaining details (like contact email) after creation. You can edit everything in Settings.</p>
            <NavButtons onBack={()=> setNewStep('spreaker')} onNext={()=> setNewStep('distribution')} />
          </div>
        )}
        {newStep==='distribution' && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Get ready to distribute</h2>
            <p className="text-sm text-gray-600 mb-4">After we create your show you'll be able to submit to directories. This step just gives you the overview.</p>
            <ul className="text-sm list-disc ml-5 mb-4 space-y-1">
              <li>Apple Podcasts</li>
              <li>Spotify</li>
              <li>Google Podcasts (YouTube Music)</li>
              <li>Others...</li>
            </ul>
            <NavButtons onBack={()=> setNewStep('lastInfo')} onNext={()=> setNewStep('reviewCreate')} />
          </div>
        )}
        {newStep==='reviewCreate' && (
          <div>
            <h2 className="text-xl font-semibold mb-3">Review</h2>
            <ul className="text-sm space-y-1 mb-5">
              <li><strong>Title:</strong> {podcastName}</li>
              <li><strong>Description:</strong> {description||'—'}</li>
              <li><strong>Format:</strong> {FORMATS.find(f=>f.key===formatKey)?.label}</li>
              <li><strong>Categories:</strong> {selectedCategories.map(id=> (categories.find(c=>c.id===id)?.name)||id).join(', ')}</li>
              <li><strong>Audience:</strong> {audience||'—'}</li>
              <li><strong>Music:</strong> {musicChoice}</li>
              <li><strong>Intro:</strong> {introMode}</li>
              <li><strong>Outro:</strong> {outroMode}</li>
              <li><strong>Cover:</strong> {coverMode}</li>
              <li><strong>Spreaker:</strong> {spreakerSaved? 'Connected':'Not connected (must connect)'} </li>
            </ul>
            <div className="flex justify-between">
              <button onClick={()=> setNewStep('distribution')} className="text-gray-500">Back</button>
              <button disabled={saving || !podcastName || !spreakerSaved} onClick={handleCreateAndTemplate} className="px-5 py-2 bg-green-600 text-white rounded disabled:opacity-50">{saving? 'Finishing...':'Finish'}</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- IMPORT PATH ---
  if(mode==='import'){
    return (
      <div className="max-w-2xl mx-auto py-10">
  <h1 className="text-2xl font-bold mb-4">Import your podcast</h1>
        {error && <div className="mb-4 p-3 text-sm bg-red-100 text-red-700 rounded">{error}</div>}
        {importStep==='rss' && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Find your podcast</h2>
            <p className="text-sm text-gray-600 mb-3">Paste your podcast feed URL (it usually ends with .xml). Search by name coming soon.</p>
            <input className="w-full border rounded p-3 mb-4" value={rssUrl} onChange={e=>setRssUrl(e.target.value)} placeholder="https://example.com/feed.xml" />
            <div className="flex justify-between">
              <button onClick={()=> setMode(null)} className="text-gray-500">Back</button>
              <button disabled={!rssUrl} onClick={handleImportRss} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">Continue</button>
            </div>
          </div>
        )}
        {importStep==='importing' && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Import in Progress</h2>
            <p className="text-sm text-gray-600 mb-4">We're importing episodes. This can take a minute.</p>
            <div className="w-full h-3 bg-gray-200 rounded overflow-hidden mb-6"><div className="h-full bg-blue-600 animate-pulse" style={{width:'60%'}}/></div>
          </div>
        )}
        {importStep==='analyze' && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Tell us how your episodes are organized</h2>
            <p className="text-sm text-gray-600 mb-3">E.g. Intro with music, interview, ad break, outro.</p>
            <textarea rows={4} className="w-full border rounded p-3 mb-4" value={importFormatDescription} onChange={e=>setImportFormatDescription(e.target.value)} />
            <div className="flex justify-between">
              <button onClick={()=> setImportStep('rss')} className="text-gray-500">Back</button>
              <button onClick={()=> setImportStep('assets')} className="px-4 py-2 bg-blue-600 text-white rounded">Continue</button>
            </div>
          </div>
        )}
        {importStep==='assets' && (
          <div>
            <h2 className="text-xl font-semibold mb-2">Upload reusable assets</h2>
            <p className="text-sm text-gray-600 mb-3">Intro music, jingles, outros, etc.</p>
            <input type="file" multiple className="mb-4" onChange={e=> setImportAssets(Array.from(e.target.files||[]))} />
            <div className="flex justify-between">
              <button onClick={()=> setImportStep('analyze')} className="text-gray-500">Back</button>
              <button onClick={()=> setImportStep('importSuccess')} className="px-4 py-2 bg-blue-600 text-white rounded">Continue</button>
            </div>
          </div>
        )}
        {importStep==='importSuccess' && (
          <div className="text-center">
            <h2 className="text-3xl font-bold mb-4">Import complete</h2>
            <p className="mb-6">Success! {importResult?.podcast_name || 'Your show'} imported. Next, build a template to match your structure.</p>
            <a href="/" className="px-6 py-3 bg-blue-600 text-white rounded">Go to Template Builder</a>
          </div>
        )}
      </div>
    );
  }
}

function NavButtons({ onBack, onNext, nextDisabled }){
  return (
    <div className="flex justify-between mt-4">
      <button onClick={onBack} disabled={!onBack} className={`px-4 py-2 rounded ${onBack? 'text-gray-600 hover:bg-gray-100':'text-gray-300'}`}>Back</button>
  <button onClick={onNext} disabled={nextDisabled} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">Continue</button>
    </div>
  );
}

function ProgressBar({ step, total }){
  const pct = ((step)/(total-1))*100;
  return (
    <div className="w-full h-2 bg-gray-200 rounded mb-6 overflow-hidden">
      <div className="h-full bg-blue-600 transition-all" style={{ width: pct+'%' }} />
    </div>
  );
}
