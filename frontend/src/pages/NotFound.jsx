import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-bold mb-2">404 — Page not found</h1>
      <p className="text-muted-foreground mb-6">We couldn't find the page you're looking for.</p>
      <div className="flex gap-3">
        <Link to="/" className="text-blue-600 underline">Go Home</Link>
        <Link to="/" className="text-blue-600 underline">Open Dashboard</Link>
      </div>
    </div>
  );
}
