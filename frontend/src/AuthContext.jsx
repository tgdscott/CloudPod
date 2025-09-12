import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';

const API_BASE_URL = (import.meta?.env?.VITE_API_BASE) || 'https://api.getpodcastplus.com'; // Define your API base URL here

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('authToken'));
    const [user, setUser] = useState(null);
    const [backendOnline, setBackendOnline] = useState(true);
    const refreshInFlight = useRef(false);
    const errorCountRef = useRef(0);
    const lastAttemptRef = useRef(0);
    const backoffRef = useRef(2000); // start at 2s
    const maxBackoff = 60000; // 60s cap

    useEffect(() => {
        if (token) {
            localStorage.setItem('authToken', token);
        } else {
            localStorage.removeItem('authToken');
        }
    }, [token]);

    const login = (newToken) => {
        setToken(newToken);
    };

    const logout = () => {
        setToken(null);
        setUser(null);
    };

    const refreshUser = useCallback(async (opts={ force:false }) => {
        if(!token) { setUser(null); return; }
        const now = Date.now();
        // Respect cooldown when backend offline unless force
        if(!opts.force && !backendOnline) {
            const since = now - lastAttemptRef.current;
            if(since < backoffRef.current) {
                return; // skip due to backoff
            }
        }
        if(refreshInFlight.current && !opts.force) return;
        refreshInFlight.current = true;
        lastAttemptRef.current = now;
        try {
            const r = await fetch('/api/users/me', { headers: { Authorization:`Bearer ${token}` }});
            if(r.ok) {
                const data = await r.json();
                setUser(data);
                if(!backendOnline) {
                    setBackendOnline(true);
                }
                errorCountRef.current = 0;
                backoffRef.current = 2000; // reset backoff
            } else {
                if(r.status === 401) {
                    // Token invalid/expired – clear it so app falls back to landing page immediately
                    setUser(null);
                    setToken(null);
                    return;
                }
                if(backendOnline) setBackendOnline(false); // mark offline on non-ok (likely 502/500 when gateway)
            }
        } catch(err) {
            if(backendOnline) setBackendOnline(false);
            if(errorCountRef.current < 5) {
                // eslint-disable-next-line no-console
                console.warn('[Auth] refreshUser failed; will not auto-retry', err.message || err);
            }
            errorCountRef.current += 1;
            backoffRef.current = Math.min(backoffRef.current * 2, maxBackoff);
        } finally {
            refreshInFlight.current = false;
        }
    }, [token, backendOnline]);

    useEffect(()=>{ refreshUser(); }, [token, refreshUser]);

    // React to hash capture event (in case provider code fires after initial render)
    useEffect(() => {
        function onCaptured(e) {
            const t = e.detail && e.detail.token;
            if(t && t !== token) {
                setToken(t);
            }
        }
        window.addEventListener('ppp-token-captured', onCaptured);
        return () => window.removeEventListener('ppp-token-captured', onCaptured);
    }, [token]);

    const value = { token, user, login, logout, refreshUser, isAuthenticated: !!token, backendOnline };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    return useContext(AuthContext);
};
