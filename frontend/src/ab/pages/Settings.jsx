
import React from "react";
import AudioCleanup from "../components/AudioCleanup";
import MagicWords from "../components/MagicWords";

export default function Settings({ token }) {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Settings</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="md:col-span-2 rounded-2xl border bg-card p-4">
          <AudioCleanup token={token} />
        </section>
        <section className="md:col-span-2 rounded-2xl border bg-card p-4">
          <MagicWords />
        </section>
      </div>
    </div>
  );
}
