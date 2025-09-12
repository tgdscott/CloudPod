import React from "react";
import { Switch } from "@/components/ui/switch";

export default function ComfortControls({ largeText, setLargeText, highContrast, setHighContrast }) {
  return (
    <div className="flex items-center gap-6 p-3 rounded-[var(--radius)] border bg-card">
      <label className="flex items-center gap-2 cursor-pointer">
        <Switch checked={largeText} onCheckedChange={setLargeText} />
        <span className="text-sm">Larger text</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <Switch checked={highContrast} onCheckedChange={setHighContrast} />
        <span className="text-sm">High contrast</span>
      </label>
    </div>
  );
}
