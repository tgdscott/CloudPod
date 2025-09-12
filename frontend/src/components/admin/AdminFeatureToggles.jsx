"use client";

import React from 'react';
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { makeApi } from "@/lib/apiClient";

/**
 * AdminFeatureToggles
 * Renders the shared "Test Mode (Admin)" toggle and saves to /api/admin/settings.
 * Props:
 * - token: string (required)
 * - initial: { test_mode?: boolean } | null (optional)
 * - onSaved?: (settings) => void (optional)
 */
export default function AdminFeatureToggles({ token, initial = null, onSaved }) {
  const { toast } = useToast();
  const [settings, setSettings] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState(null);

  // Load if no initial provided
  React.useEffect(() => {
    if (initial != null) { setSettings(initial); return; }
    if (!token) return;
    let canceled = false;
    (async () => {
      try {
        const api = makeApi(token);
  const data = await api.get('/api/admin/settings');
  if (!canceled) setSettings(data || { test_mode: false, default_user_active: true });
      } catch {
  if (!canceled) setSettings({ test_mode: false, default_user_active: true });
      }
    })();
    return () => { canceled = true; };
  }, [token, initial]);

  const save = async (next, prev) => {
    if (!token) return;
    setSaving(true);
    setErr(null);
    try {
      const api = makeApi(token);
      const data = await api.put('/api/admin/settings', next);
      setSettings(data);
      if (onSaved) onSaved(data);
    } catch (e) {
      setErr(e?.message || 'Failed');
      try { toast({ title: 'Error', description: 'Failed to update admin settings', variant: 'destructive' }); } catch {}
      // Revert optimistic change on failure
      if (prev) setSettings(prev);
    } finally {
      setSaving(false);
    }
  };

  const onToggle = (checked) => {
    const prev = { ...(settings || {}) };
    const next = { ...prev, test_mode: !!checked };
    setSettings(next); // optimistic update
    save(next, prev);
  };

  const onDefaultActiveToggle = (checked) => {
    const prev = { ...(settings || {}) };
    const next = { ...prev, default_user_active: !!checked };
    setSettings(next);
    save(next, prev);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-medium text-gray-700">Test Mode (Admin)</Label>
          <p className="text-sm text-gray-500 mt-1">
            When enabled, new episodes default to draft and season/episode numbers are overridden to day-of-month and HHMM.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {saving && <span className="text-xs text-gray-400">Saving…</span>}
          {err && <span className="text-xs text-red-500" title={err}>Err</span>}
          <Switch
            checked={!!(settings && settings.test_mode)}
            disabled={saving}
            onCheckedChange={onToggle}
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-medium text-gray-700">New Users Are Active By Default</Label>
          <p className="text-sm text-gray-500 mt-1">
            When disabled, newly created accounts start as inactive and will see the Closed-Alpha gate until approved.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {saving && <span className="text-xs text-gray-400">Saving…</span>}
          {err && <span className="text-xs text-red-500" title={err}>Err</span>}
          <Switch
            checked={!!(settings && settings.default_user_active)}
            disabled={saving}
            onCheckedChange={onDefaultActiveToggle}
          />
        </div>
      </div>
    </div>
  );
}
