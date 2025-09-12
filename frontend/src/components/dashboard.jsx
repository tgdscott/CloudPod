"use client"

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Headphones,
  Plus,
  Edit,
  Trash2,
  Share2,
  Play,
  Download,
  Users,
  LogOut,
  Bell,
  Search,
  Target,
  Zap,
  Mic,
  Upload,
  FileText,
  Music,
  BarChart3,
  Loader2,
  Podcast,
  ArrowLeft,
  Rss,
  AlertTriangle,
  Settings as SettingsIcon,
  DollarSign,
} from "lucide-react";
import { useState, useEffect } from "react";
import { makeApi } from "@/lib/apiClient";
import { useAuth } from "@/AuthContext";
import { useToast } from "@/hooks/use-toast";
import Logo from "@/components/Logo.jsx";

import TemplateEditor from "@/components/dashboard/TemplateEditor";
import PodcastCreator from "@/components/dashboard/PodcastCreator";
import MediaLibrary from "@/components/dashboard/MediaLibrary";
import EpisodeHistory from "@/components/dashboard/EpisodeHistory";
import PodcastManager from "@/components/dashboard/PodcastManager";
import RssImporter from "@/components/dashboard/RssImporter";
import DevTools from "@/components/dashboard/DevTools";
import TemplateWizard from "@/components/dashboard/TemplateWizard";
import Settings from "@/components/dashboard/Settings";
import TemplateManager from "@/components/dashboard/TemplateManager";
import BillingPage from "@/components/dashboard/BillingPage";
import Recorder from "@/components/quicktools/Recorder";

const isAdmin = (u) => !!(u && (u.is_admin || u.role === 'admin'));

function formatRelative(iso) {
  if(!iso) return '—';
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const sec = Math.floor(diffMs/1000);
    if(sec < 60) return 'just now';
    const min = Math.floor(sec/60);
    if(min < 60) return `${min}m ago`;
    const hr = Math.floor(min/60);
    if(hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr/24);
    if(day < 30) return `${day}d ago`;
    const mo = Math.floor(day/30);
    if(mo < 12) return `${mo}mo ago`;
    const yr = Math.floor(mo/12);
    return `${yr}y ago`;
  } catch { return '—'; }
}

function formatAssemblyStatus(status) {
  if(!status) return '—';
  switch(status) {
    case 'success': return 'Success';
    case 'error': return 'Error';
    case 'pending': return 'In Progress';
    default: return status.charAt(0).toUpperCase()+status.slice(1);
  }
}

function formatShort(iso) {
  if(!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const pad = (n) => String(n).padStart(2,'0');
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ''; }
}

export default function PodcastPlusDashboard() {
  const { token, logout, user: authUser } = useAuth();
  const { toast } = useToast();
  const [user, setUser] = useState(null); // local alias for convenience
  const [templates, setTemplates] = useState([]);
  const [podcasts, setPodcasts] = useState([]);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [currentView, setCurrentView] = useState(() => {
    try { if(localStorage.getItem('ppp_post_checkout')==='1') return 'billing'; } catch {}
    return 'dashboard';
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [preselectedMainFilename, setPreselectedMainFilename] = useState(null);
  const [preselectedTranscriptReady, setPreselectedTranscriptReady] = useState(false);

  const fetchData = async () => {
    if (!token) return;
    try {
      setStatsError(null);
      const api = makeApi(token);
      const [templatesData, podcastsData, statsData] = await Promise.all([
        api.get('/api/templates/'),
        api.get('/api/podcasts/'),
        api.get('/api/dashboard/stats').catch(e => { setStatsError('Failed to load stats.'); return null; }),
      ]);
      setTemplates(templatesData);
      setPodcasts(podcastsData);
      setStats(statsData);
    } catch (err) {
      setStatsError('Failed to load dashboard data.');
      console.error("Failed to fetch dashboard data:", err);
      logout();
    }
  };

  // Initial load + token change: fetch other data (user already fetched by AuthContext)
  useEffect(() => { if (token) { fetchData(); } }, [token, logout]);
  // Fetch notifications
  useEffect(() => {
    if(!token) return;
    let cancelled = false;
    const load = async () => {
      try {
        const api = makeApi(token);
        const r = await api.get('/api/notifications/');
        if(!cancelled && Array.isArray(r)) {
          setNotifications(curr => {
            const map = new Map((curr||[]).map(n=>[n.id,n]));
            const merged = r.map(n => {
              const existing = map.get(n.id);
              if(existing && existing.read_at) return { ...n, read_at: existing.read_at };
              return n;
            });
            for(const n of (curr||[])) if(!merged.find(m=>m.id===n.id)) merged.push(n);
            return merged.sort((a,b)=> new Date(b.created_at||0) - new Date(a.created_at||0));
          });
        }
      } catch {}
    };
    load();
  }, [token]);
  // BroadcastChannel listener for checkout success -> refetch notifications
  useEffect(() => {
    let bc;
    try {
  bc = new BroadcastChannel('ppp_billing');
      bc.onmessage = (e) => {
        if(e?.data?.type === 'checkout_success') {
          // Refresh notifications & maybe toast
          (async ()=>{
            try {
              const api = makeApi(token);
              const d = await api.get('/api/notifications/');
              setNotifications(curr=>{
            const map = new Map((curr||[]).map(n=>[n.id,n]));
                const merged = (Array.isArray(d)? d: []).map(n=>{ const ex = map.get(n.id); if(ex && ex.read_at) return { ...n, read_at: ex.read_at }; return n; });
                for(const n of (curr||[])) if(!merged.find(m=>m.id===n.id)) merged.push(n);
                return merged.sort((a,b)=> new Date(b.created_at||0) - new Date(a.created_at||0));
              });
            } catch {}
          })();
        } else if(e?.data?.type === 'subscription_updated') {
          // Refetch subscription in case Billing page not mounted & show toast if not already billing view
          if(currentView !== 'billing') {
            toast({ title:'Subscription Updated', description:`Plan changed to ${e.data.payload?.plan_key}`, duration:5000 });
          }
        }
      };
    } catch {}
    const storageHandler = (ev) => {
      if(ev.key === 'ppp_last_checkout') {
        (async ()=>{
          try {
            const api = makeApi(token);
            const d = await api.get('/api/notifications/');
            setNotifications(curr=>{
              const map = new Map((curr||[]).map(n=>[n.id,n]));
              const merged = (Array.isArray(d)? d: []).map(n=>{ const ex = map.get(n.id); if(ex && ex.read_at) return { ...n, read_at: ex.read_at }; return n; });
              for(const n of (curr||[])) if(!merged.find(m=>m.id===n.id)) merged.push(n);
              return merged.sort((a,b)=> new Date(b.created_at||0) - new Date(a.created_at||0));
            });
          } catch {}
        })();
      }
    };
    window.addEventListener('storage', storageHandler);
    return () => { try { bc && bc.close(); } catch{} window.removeEventListener('storage', storageHandler); };
  }, [token, currentView, toast]);
  // Sync local user with auth context
  useEffect(() => { setUser(authUser); }, [authUser]);
  // Clear post-checkout flag once we've mounted and possibly navigated
  useEffect(() => { if(currentView==='billing') { try { localStorage.removeItem('ppp_post_checkout'); } catch {} } }, [currentView]);

  const handleEditTemplate = (templateId) => {
    setSelectedTemplateId(templateId);
    setCurrentView('editTemplate');
  };

  const handleBackToDashboard = () => {
    setSelectedTemplateId(null);
    setCurrentView('dashboard');
  };
  
  const handleBackToTemplateManager = () => {
      setSelectedTemplateId(null);
      setCurrentView('templateManager');
  }

  const handleDeleteTemplate = async (templateId) => {
    if (!window.confirm("Are you sure you want to delete this template? This cannot be undone.")) return;
  try {
    const api = makeApi(token);
    await api.del(`/api/templates/${templateId}`);
    toast({ title: "Success", description: "Template deleted." });
    fetchData(); 
  } catch (err) {
    toast({ title: "Error", description: err.message, variant: "destructive" });
  }
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'recorder':
  return (
          <Recorder
            onBack={handleBackToDashboard}
            token={token}
            onFinish={({ filename, hint, transcriptReady, startStep }) => {
              try {
                setPreselectedMainFilename(filename || hint || null);
                setPreselectedTranscriptReady(!!transcriptReady);
              } catch {}
              setCurrentView('createEpisode');
            }}
          />
        );
      case 'templateManager':
        return <TemplateManager onBack={() => setCurrentView('dashboard')} token={token} setCurrentView={setCurrentView} />;
      case 'editTemplate':
        return <TemplateEditor templateId={selectedTemplateId} onBack={handleBackToTemplateManager} token={token} onTemplateSaved={fetchData} />;
      case 'createEpisode':
        return (
          <PodcastCreator
            onBack={handleBackToDashboard}
            token={token}
            templates={templates}
            podcasts={podcasts}
            preselectedMainFilename={preselectedMainFilename}
            preselectedTranscriptReady={preselectedTranscriptReady}
          />
        );
      case 'mediaLibrary':
        return <MediaLibrary onBack={handleBackToDashboard} token={token} />;
      case 'episodeHistory':
        return <EpisodeHistory onBack={handleBackToDashboard} token={token} />;
      case 'podcastManager':
        return <PodcastManager onBack={handleBackToDashboard} token={token} podcasts={podcasts} setPodcasts={setPodcasts}/>;
      case 'rssImporter':
        return <RssImporter onBack={handleBackToDashboard} token={token} />;
      case 'devTools':
  return isAdmin(authUser) ? <DevTools token={token} /> : <div className="p-6 text-sm text-red-600">Not authorized.</div>;
      case 'settings':
        return <Settings token={token} />;
      case 'templateWizard':
        return <TemplateWizard user={user} token={token} onBack={() => setCurrentView('templateManager')} onTemplateCreated={() => { fetchData(); setCurrentView('templateManager'); }} />;
      case 'billing':
        return <BillingPage token={token} onBack={() => setCurrentView('dashboard')} />;
      case 'dashboard':
      default: {
        const canCreateEpisode = podcasts.length > 0 && templates.length > 0;
        return (
          <div className="space-y-8">
            {/* Hero / Greeting */}
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: '#2C3E50' }}>
                  Welcome back{user && `, ${user.first_name || user.email.split('@')[0]}`}!
                </h1>
                <p className="text-sm md:text-base text-gray-600 mt-1">Quick launch your next episode or jump into a tool.</p>
              </div>
              {/* A/B link moved to Settings footer per request */}
            </div>
            {statsError && (
              <div className="bg-red-100 border border-red-300 text-red-700 rounded p-3 mb-4 text-sm">
                {statsError}
              </div>
            )}
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* Create Episode Card */}
                <Card className="shadow-sm border border-gray-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Create Episode</CardTitle>
                    <CardDescription>Assemble a new episode from your shows & templates.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-center gap-6 text-sm">
                      <div>
                        <div className="text-[11px] tracking-wide text-gray-500">Shows</div>
                        <div className="font-semibold text-gray-800 mt-0.5">{podcasts.length}</div>
                      </div>
                      <div>
                        <div className="text-[11px] tracking-wide text-gray-500">Episodes</div>
                        <div className="font-semibold text-gray-800 mt-0.5">{stats?.total_episodes ?? '–'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] tracking-wide text-gray-500">Ready?</div>
                        <div className={`font-semibold mt-0.5 ${canCreateEpisode ? 'text-green-600' : 'text-amber-600'}`}>{canCreateEpisode ? 'Yes' : 'Setup needed'}</div>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                      {canCreateEpisode ? (
                        <Button onClick={() => setCurrentView('createEpisode')} className="flex-1 md:flex-none">
                          <Plus className="w-4 h-4 mr-2" />New Episode
                        </Button>
                      ) : (
                        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                          {podcasts.length === 0 && <span>Add a show. </span>}
                          {templates.length === 0 && <span>Create a template.</span>}
                        </div>
                      )}
                      {!canCreateEpisode && (
                        <div className="flex gap-2">
                          {podcasts.length === 0 && <Button variant="outline" size="sm" onClick={() => setCurrentView('podcastManager')}>Add show</Button>}
                          {templates.length === 0 && <Button variant="outline" size="sm" onClick={() => setCurrentView('templateManager')}>Add template</Button>}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                {/* Recent Activity & Listening Metrics */}
                <Card className="shadow-sm border border-gray-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Recent Activity</CardTitle>
                    <CardDescription>Production pace and listening at a glance.</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-gray-700 space-y-4">
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="p-3 rounded border bg-white flex flex-col gap-1">
                        <span className="text-[11px] tracking-wide text-gray-500">Episodes published in last 30 days</span>
                        <span className="text-lg font-semibold">{stats?.episodes_last_30d ?? '–'}</span>
                      </div>
                      <div className="p-3 rounded border bg-white flex flex-col gap-1">
                        <span className="text-[11px] tracking-wide text-gray-500">Episodes scheduled</span>
                        <span className="text-lg font-semibold">{stats?.upcoming_scheduled ?? 0}</span>
                      </div>
                      <div className="p-3 rounded border bg-white flex flex-col gap-1">
                        <span className="text-[11px] tracking-wide text-gray-500">Last episode published</span>
                        <span className="text-sm font-medium">{formatRelative(stats?.last_published_at)}</span>
                      </div>
                      <div className="p-3 rounded border bg-white flex flex-col gap-1">
                        <span className="text-[11px] tracking-wide text-gray-500">Last assembly result</span>
                        <span className={`text-sm font-medium ${stats?.last_assembly_status==='error'?'text-red-600': stats?.last_assembly_status==='success'?'text-green-600': stats?.last_assembly_status==='pending'?'text-amber-600':'text-gray-600'}`}>{formatAssemblyStatus(stats?.last_assembly_status)}</span>
                      </div>
                    </div>
          {(typeof stats?.plays_last_30d === 'number' || typeof stats?.show_total_plays === 'number' || (stats?.recent_episode_plays?.length)) && (
                      <div className="space-y-3">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Listening</div>
                        <div className="grid md:grid-cols-2 gap-3">
              {typeof stats?.plays_last_30d === 'number' && (
                            <div className="p-3 rounded border bg-white flex flex-col gap-1">
                <span className="text-[11px] tracking-wide text-gray-500">Plays Last 30 Days</span>
                <span className="text-lg font-semibold">{stats.plays_last_30d}</span>
                            </div>
                          )}
                          {Array.isArray(stats?.recent_episode_plays) && stats.recent_episode_plays.slice(0,4).map(ep => (
                            <div key={ep.episode_id} className="p-3 rounded border bg-white flex flex-col gap-1">
                              <span className="text-[11px] tracking-wide text-gray-500 truncate" title={ep.title}>{ep.title}</span>
                              <span className="text-lg font-semibold">{ep.plays_total ?? '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] text-gray-400">Plays update periodically; detailed windows (24h / 7d / 30d) coming soon.</p>
                  </CardContent>
                </Card>
              </div>
              {/* Quick Tools */}
              <div className="space-y-6">
        <Card className="shadow-sm border border-gray-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Quick Tools</CardTitle>
                    <CardDescription className="text-xs">Jump directly into a management area.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => setCurrentView('podcastManager')} variant="outline" className="justify-start text-sm h-10"><Podcast className="w-4 h-4 mr-2" />Podcasts</Button>
                      <Button onClick={() => setCurrentView('templateManager')} variant="outline" className="justify-start text-sm h-10"><FileText className="w-4 h-4 mr-2" />Templates</Button>
                      <Button onClick={() => setCurrentView('mediaLibrary')} variant="outline" className="justify-start text-sm h-10"><Music className="w-4 h-4 mr-2" />Media</Button>
          <Button onClick={() => setCurrentView('recorder')} variant="outline" className="justify-start text-sm h-10"><Mic className="w-4 h-4 mr-2" />Record</Button>
          <Button onClick={() => setCurrentView('episodeHistory')} variant="outline" className="justify-start text-sm h-10"><BarChart3 className="w-4 h-4 mr-2" />Episodes</Button>
          {/* Import moved under Podcasts */}
          <Button onClick={() => setCurrentView('billing')} variant="outline" className="justify-start text-sm h-10"><DollarSign className="w-4 h-4 mr-2" />Subscription</Button>
                      <Button onClick={() => setCurrentView('settings')} variant="outline" className="justify-start text-sm h-10"><SettingsIcon className="w-4 h-4 mr-2" />Settings</Button>
                      {isAdmin(authUser) && (
                        <Button onClick={() => setCurrentView('devTools')} variant="destructive" className="justify-start text-sm h-10"><AlertTriangle className="w-4 h-4 mr-2" />Dev</Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        );
      }
    }
  };
  
  useEffect(() => {
    const toBilling = () => setCurrentView('billing');
    window.addEventListener('ppp:navigate-billing', toBilling);
    const toView = (e) => {
      try {
        const v = e?.detail;
        if (typeof v === 'string') setCurrentView(v);
      } catch {}
    };
    window.addEventListener('ppp:navigate-view', toView);
    return () => {
      window.removeEventListener('ppp:navigate-billing', toBilling);
      window.removeEventListener('ppp:navigate-view', toView);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
    <nav className="border-b border-gray-200 px-4 py-4 bg-white shadow-sm">
        <div className="container mx-auto max-w-7xl flex justify-between items-center">
      <Logo size={28} lockup />
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Button variant="ghost" size="sm" className="relative" onClick={()=>setShowNotifPanel(v=>!v)}>
                <Bell className="w-5 h-5" />
                {notifications.filter(n=>!n.read_at).length > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center bg-red-500 text-white text-xs">{notifications.filter(n=>!n.read_at).length}</Badge>
                )}
              </Button>
              {showNotifPanel && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded shadow-lg z-50 max-h-96 overflow-auto">
                  <div className="p-3 font-semibold border-b flex items-center justify-between">
                    <span>Notifications</span>
                    {notifications.some(n=>!n.read_at) && (
                      <button
                        className="text-xs text-blue-600 hover:underline"
                        onClick={async ()=>{
                          try {
                            const api = makeApi(token);
                            await api.post('/api/notifications/read-all');
                            setNotifications(curr=>curr.map(n=> n.read_at ? n : { ...n, read_at: new Date().toISOString() }));
                          } catch {}
                        }}
                      >Mark all read</button>
                    )}
                  </div>
                  {notifications.length === 0 && <div className="p-3 text-sm text-gray-500">No notifications</div>}
                  {notifications.map(n => (
                    <div key={n.id} className="p-3 text-sm border-b last:border-b-0 flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium mr-2 truncate">{n.title}</div>
                        <div className="text-[11px] text-gray-500 whitespace-nowrap">{formatShort(n.created_at)}</div>
                      </div>
                      {n.body && <div className="text-gray-600 text-xs">{n.body}</div>}
                      {!n.read_at && <button className="text-xs text-blue-600 self-start" onClick={async ()=>{ try { const api = makeApi(token); await api.post(`/api/notifications/${n.id}/read`); setNotifications(curr=>curr.map(x=>x.id===n.id?{...x,read_at:new Date().toISOString()}:x)); } catch{} }}>Mark read</button>}
                    </div>
                  ))}
                </div>) }
            </div>
            <div className="flex items-center space-x-3"><Avatar className="h-8 w-8"><AvatarImage src={user?.picture} /><AvatarFallback>{user?.email ? user.email.substring(0, 2).toUpperCase() : '...'}</AvatarFallback></Avatar><span className="hidden md:block text-sm font-medium" style={{ color: "#2C3E50" }}>{user ? user.email : 'Loading...'}</span></div>
            <Button onClick={logout} variant="ghost" size="sm" className="text-gray-600 hover:text-gray-800"><LogOut className="w-4 h-4 mr-1" /><span className="hidden md:inline">Logout</span></Button>
          </div>
        </div>
      </nav>
      <main className="container mx-auto max-w-7xl px-4 py-6">
        {renderCurrentView()}
      </main>
    </div>
  );
}
