import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Progress } from '../ui/progress';
import { makeApi, isApiError } from '@/lib/apiClient';

export default function BillingPage({ token, onBack }) {
  const { refreshUser } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutDetails, setCheckoutDetails] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [planPolling, setPlanPolling] = useState(false);
  const { toast } = (() => { try { return useToast(); } catch { return { toast: () => {} }; } })();
  const tabIdRef = useRef(null);
  if(!tabIdRef.current) {
    try { tabIdRef.current = sessionStorage.getItem('ppp_tab_id') || Math.random().toString(36).slice(2); } catch { tabIdRef.current = Math.random().toString(36).slice(2); }
  }
  const bcRef = useRef(null);
  useEffect(()=>{ try { bcRef.current = new BroadcastChannel('ppp_checkout_owner'); bcRef.current.onmessage = (e)=>{
      if(e?.data?.type === 'owner_claimed' && e.data.owner !== tabIdRef.current) {
        // Another tab owns; if we have success params, attempt close quickly
        const params = new URLSearchParams(window.location.search);
        if(params.get('checkout')==='success') {
          window.close();
          setTimeout(()=>{ try { if(!document.hidden) window.location.replace('/'); } catch{} }, 200);
        }
      }
    }; } catch{} return ()=>{ try { bcRef.current && bcRef.current.close(); } catch{} } }, []);

  const fetchAll = async () => {
    try {
      const api = makeApi(token);
      const [subData, usageData] = await Promise.all([
        api.get('/api/billing/subscription'),
        api.get('/api/billing/usage'),
      ]);
      setSubscription(subData);
      setUsage(usageData);
    } catch (e) {
      const msg = isApiError(e) ? (e.detail || e.error || e.message) : String(e);
      setError(msg);
    }
    finally { setLoading(false); }
  };

  useEffect(()=>{ fetchAll(); }, [token]);

  // Handle coming back from Stripe checkout (can be popup or main tab)
  useEffect(()=>{
    const params = new URLSearchParams(window.location.search);
    const isSuccess = params.get('checkout') === 'success';
    const sessionId = params.get('session_id');
    const isPopup = typeof window !== 'undefined' && window.opener && window.name === 'ppp_stripe_checkout';
    if(!isSuccess) return; // nothing to do
    (async () => {
      // Ownership: only one tab should handle post-checkout. If another already did, try to close self.
      try {
        const owner = localStorage.getItem('ppp_checkout_owner');
        if(owner && owner !== tabIdRef.current) {
          // Secondary tab: auto-close/redirect
          window.close();
          setTimeout(()=>{ try { if(!document.hidden) window.location.replace('/'); } catch{} }, 150);
          return;
        } else if(!owner) {
          localStorage.setItem('ppp_checkout_owner', tabIdRef.current);
          try { bcRef.current?.postMessage({ type:'owner_claimed', owner: tabIdRef.current }); } catch{}
        }
      } catch {}
      try { toast({ title:'Processing Purchase', description:'Finalizing your subscription...', duration:4000 }); } catch {}
      // Try to capture checkout result (optional)
      if(sessionId) {
        for(let attempt=0; attempt<5; attempt++) {
          try {
            const api = makeApi(token);
            const data = await api.get(`/api/billing/checkout_result?session_id=${sessionId}`);
            setCheckoutDetails(data); setShowModal(true);
            try { const bc = new BroadcastChannel('ppp_billing'); bc.postMessage({ type:'checkout_success', payload:data }); bc.close(); } catch {}
            try { localStorage.setItem('ppp_last_checkout', JSON.stringify({ ts:Date.now(), data })); } catch {}
            break;
          } catch {}
          await new Promise(res=>setTimeout(res, 300*(attempt+1)));
        }
      }
      // Attempt immediate force sync (shortcut over webhook latency)
      let upgraded = false;
      if(sessionId) {
        for(let attempt=0; attempt<6 && !upgraded; attempt++) {
          try {
            const api = makeApi(token);
            const fsData = await api.post('/api/billing/force_sync_session', { session_id: sessionId });
            if(fsData?.plan_key && fsData.plan_key !== 'free') {
              setSubscription(s => ({ ...(s||{}), plan_key: fsData.plan_key, current_period_end: fsData.current_period_end }));
              upgraded = true;
              refreshUser({ force:true });
              setTimeout(()=>refreshUser({ force:true }), 1200); // double-tap to catch race
              toast({ title:'Subscription Upgraded', description:`You are now on the ${fsData.plan_key} plan.`, duration:5000 });
              try { const bc = new BroadcastChannel('ppp_billing'); bc.postMessage({ type:'subscription_updated', payload: fsData }); bc.close(); } catch {}
            }
          } catch {}
          if(!upgraded) await new Promise(res=>setTimeout(res, 800));
        }
      }
      if(!upgraded && !isPopup) {
        setPlanPolling(true);
        let tries=0;
        const poll=async()=>{
          tries+=1;
          try {
            const api = makeApi(token);
            const sub = await api.get('/api/billing/subscription');
            setSubscription(sub);
            if(sub.plan_key !== 'free') {
              refreshUser({ force:true });
              setTimeout(()=>refreshUser({ force:true }), 1200);
              toast({ title:'Subscription Upgraded', description:`You are now on the ${sub.plan_key} plan.`, duration:5000 });
              try { const bc = new BroadcastChannel('ppp_billing'); bc.postMessage({ type:'subscription_updated', payload: sub }); bc.close(); } catch {}
              setPlanPolling(false); return;
            }
          } catch {}
          if(tries < 15) setTimeout(poll, 1000); else { setPlanPolling(false); try { toast({ title:'Upgrade Pending', description:'Payment complete. Your plan will reflect the upgrade shortly.', duration:6000 }); } catch {} }
        };
        poll();
      }
      if(!isPopup) {
        fetchAll();
        try { window.history.replaceState(null,'', window.location.pathname); } catch {}
      }
      // Release ownership after short delay (so manual refresh doesn't spawn duplicates)
      setTimeout(()=>{ try { const owner = localStorage.getItem('ppp_checkout_owner'); if(owner === tabIdRef.current) localStorage.removeItem('ppp_checkout_owner'); } catch {} }, 5000);
      if(isPopup) {
        // Close popup after a brief delay once done.
        setTimeout(()=>{ try { window.close(); } catch{} }, 600);
      }
    })();
  }, [token, toast]);

  const startCheckout = async (planKey, billingCycle='monthly') => {
    try {
      setCheckoutLoading(true);
      const api = makeApi(token);
      const data = await api.post('/api/billing/checkout', { plan_key: planKey, billing_cycle: billingCycle });
      // Open popup for checkout
      const w = window.open(data.url, 'ppp_stripe_checkout', 'width=720,height=850,noopener');
      if(!w) {
        // Fallback: navigate current tab
        window.location.href = data.url;
      } else {
        try { w.focus(); } catch {}
      }
    } catch(e) {
      const msg = isApiError(e) ? (e.detail || e.error || e.message) : String(e);
      setError(msg);
    }
    finally { setCheckoutLoading(false); }
  };

  const openPortal = async () => {
    try {
      setPortalLoading(true);
      const api = makeApi(token);
      const data = await api.post('/api/billing/portal', {});
      window.location.href = data.url;
    } catch(e) {
      const msg = isApiError(e) ? (e.detail || e.error || e.message) : String(e);
      setError(msg);
    }
    finally { setPortalLoading(false); }
  };

  const formatDate = (iso) => {
    try { const d = new Date(iso); const mm = String(d.getMonth()+1).padStart(2,'0'); const dd = String(d.getDate()).padStart(2,'0'); const yy = d.getFullYear(); return `${mm}-${dd}-${yy}`; } catch { return iso; }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {onBack && <Button variant="ghost" onClick={onBack}>Back</Button>}
        <h2 className="text-2xl font-semibold">Billing</h2>
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <Card>
        <CardHeader><CardTitle>Current Plan</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {loading && <div className="text-sm text-gray-500">Loading...</div>}
          {!loading && subscription && (
            <div className="space-y-1 text-sm">
              <div>Plan: <span className="font-medium capitalize">{subscription.plan_key}</span></div>
              {subscription.plan_key !== 'free' && subscription.current_period_end && <div>Renews: {formatDate(subscription.current_period_end)}</div>}
            </div>
          )}
          {planPolling && <div className="text-xs text-amber-600">Finalizing upgrade...</div>}
          <div className="flex flex-col gap-2">
            {subscription?.plan_key === 'free' && (<>
              <Button disabled={checkoutLoading} onClick={()=>startCheckout('creator','monthly')}>Upgrade to Creator (Monthly)</Button>
              <Button variant="outline" disabled={checkoutLoading} onClick={()=>startCheckout('creator','annual')}>Creator Annual</Button>
              <Button disabled={checkoutLoading} onClick={()=>startCheckout('pro','monthly')}>Pro Monthly</Button>
              <Button variant="outline" disabled={checkoutLoading} onClick={()=>startCheckout('pro','annual')}>Pro Annual</Button>
            </>)}
            {subscription?.plan_key === 'creator' && (<>
              <Button disabled={checkoutLoading} onClick={()=>startCheckout('pro','monthly')}>Upgrade to Pro (Monthly)</Button>
              <Button variant="outline" disabled={checkoutLoading} onClick={()=>startCheckout('pro','annual')}>Pro Annual</Button>
              <Button disabled={portalLoading} variant="secondary" onClick={openPortal}>Manage Subscription</Button>
            </>)}
            {subscription?.plan_key === 'pro' && (<Button disabled={portalLoading} onClick={openPortal}>Manage Subscription</Button>)}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Usage</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!usage && <div className="text-sm text-gray-500">Loading usage...</div>}
          {usage && (() => {
            const usedMin = typeof usage.processing_minutes_used_this_month === 'number' ? usage.processing_minutes_used_this_month : (typeof usage.minutes_used === 'number' ? usage.minutes_used : null);
            const capMin = (typeof usage.max_processing_minutes_month === 'number') ? usage.max_processing_minutes_month : (usage.max_processing_minutes_month == null ? null : undefined);
            const leftMin = (capMin == null) ? '∞' : (usedMin == null ? null : Math.max(0, capMin - usedMin));
            const pct = (capMin && typeof usedMin === 'number') ? Math.min(100, (usedMin/Math.max(1,capMin))*100) : null;
            return (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Minutes</span><span>{usedMin ?? '—'} / {capMin == null ? '∞' : capMin}</span></div>
                {typeof pct === 'number' && <Progress value={pct} />}
                {leftMin !== null && <div className="text-xs text-muted-foreground">Minutes left: {leftMin}</div>}
              </div>
            );
          })()}
        </CardContent>
      </Card>
      {showModal && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
          <h3 className="text-xl font-semibold">Subscription Updated</h3>
          <div className="space-y-2 text-sm">
            <div>Plan: <span className="font-medium capitalize">{checkoutDetails?.plan_key}</span>{checkoutDetails?.billing_cycle && <span className="ml-1 text-gray-500">({checkoutDetails.billing_cycle})</span>}</div>
            {checkoutDetails?.plan_key !== 'free' && checkoutDetails?.renewal_date && <div>Renewal: {formatDate(checkoutDetails.renewal_date)}</div>}
            {checkoutDetails?.applied_credit && <div>Prorated credit from previous plan: ${checkoutDetails.applied_credit.toFixed(2)}</div>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={()=>setShowModal(false)}>Close</Button>
            <Button onClick={()=>{ setShowModal(false); if(onBack) onBack(); }}>Go to Dashboard</Button>
          </div>
        </div>
      </div>}
    </div>
  );
}
