import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/AuthContext';
import { makeApi } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';

export default function AdminTierEditor() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const api = makeApi(token);
        const data = await api.get('/api/admin/tiers');
        if (!cancelled) setCfg(data);
      } catch (e) {
        if (!cancelled) {
          setError('Failed to load tiers');
          try { toast({ title: 'Error', description: 'Failed to load Tier configuration', variant: 'destructive' }); } catch {}
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const tiers = useMemo(() => (cfg?.tiers || []), [cfg]);
  const features = useMemo(() => (cfg?.features || []), [cfg]);

  const setValue = (fidx, tierName, value) => {
    setCfg(prev => {
      if (!prev) return prev;
      const next = { ...prev, features: prev.features.map((f, i) => i === fidx ? ({ ...f, values: { ...f.values, [tierName]: value } }) : f) };
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const api = makeApi(token);
      const data = await api.put('/api/admin/tiers', cfg);
      setCfg(data);
      setDirty(false);
      try { toast({ title: 'Saved', description: 'Tier configuration updated.' }); } catch {}
    } catch (e) {
      try { toast({ title: 'Save failed', description: e?.message || 'Network error', variant: 'destructive' }); } catch {}
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Tier Editor</CardTitle>
          <div className="text-sm text-gray-500">Columns are tiers. Rows are features. Unlimited tier is implicit and not listed.</div>
        </CardHeader>
        <CardContent>
          {loading && <div className="text-sm text-gray-600">Loading...</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!loading && !error && cfg && (
            <div className="overflow-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[260px]">Feature</TableHead>
                    {tiers.map(t => (
                      <TableHead key={t} className="text-center">{t}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {features.map((f, idx) => (
                    <TableRow key={f.key}>
                      <TableCell>
                        <div className="font-medium">{f.label || f.key}</div>
                        <div className="text-xs text-gray-500">{f.type === 'boolean' ? 'On/Off' : 'Number'}</div>
                      </TableCell>
                      {tiers.map(tier => (
                        <TableCell key={tier} className="text-center">
                          {f.type === 'boolean' ? (
                            <div className="flex justify-center">
                              <Switch checked={!!f.values?.[tier]} onCheckedChange={(v) => setValue(idx, tier, !!v)} />
                            </div>
                          ) : (
                            <div className="flex justify-center">
                              <Input
                                type="number"
                                className="w-28"
                                value={String(f.values?.[tier] ?? '')}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const num = v === '' ? '' : Number(v);
                                  setValue(idx, tier, num === '' ? 0 : (isNaN(num) ? 0 : num));
                                }}
                              />
                            </div>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Button onClick={save} disabled={!dirty || saving}>{saving ? 'Saving...' : 'Save'}</Button>
            <Button variant="outline" disabled={saving} onClick={() => { setCfg(null); setDirty(false); setError(null); setLoading(true); setTimeout(()=>{ setLoading(false); }, 0); }}>Reset</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
