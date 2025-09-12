"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/AuthContext.jsx";
import { useToast } from "@/hooks/use-toast";
import AdminFeatureToggles from "@/components/admin/AdminFeatureToggles.jsx";

export default function AdminSettings() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Only attempt admin fetch if user is known admin; otherwise skip noisy 403s
        if (!(user && (user.is_admin || user.role === 'admin'))) {
          setIsAdmin(false);
          return;
        }
        const r = await fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${token}` }});
        if (r.ok) {
          const data = await r.json();
          setIsAdmin(true);
          setTestMode(!!data.test_mode);
        } else if (r.status === 403) {
          setIsAdmin(false);
        }
      } catch {}
    })();
  }, [token, user]);

  if (!isAdmin) return null;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Admin Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <AdminFeatureToggles token={token} initial={{ test_mode: testMode }} onSaved={(s)=> setTestMode(!!s?.test_mode)} />
      </CardContent>
    </Card>
  );
}
