import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, isApiError } from "../../lib/apiClient.js";

export default function ProtectedRoute({ children }) {
  const [status, setStatus] = useState("loading"); // loading | ok | unauthed

  useEffect(() => {
    let mounted = true;
    api.get("/api/auth/me")
      .then(() => mounted && setStatus("ok"))
      .catch(() => mounted && setStatus("unauthed"));
    return () => { mounted = false; };
  }, []);

  if (status === "loading") return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (status === "unauthed") return <Navigate to="/login" replace />;
  return children;
}
