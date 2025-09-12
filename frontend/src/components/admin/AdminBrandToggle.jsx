"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export default function AdminBrandToggle() {
  // Read current selection ('ppp' | 'nsc')
  let current = "ppp";
  try {
    const saved = localStorage.getItem("brand");
    if (saved === "nsc" || saved === "ppp") current = saved;
  } catch {}

  const [value, setValue] = React.useState(current);

  const apply = (next) => {
    if (next === "auto") {
      try { localStorage.removeItem("brand"); } catch {}
    } else {
      try { localStorage.setItem("brand", next); } catch {}
    }
    window.location.reload();
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        <Label className="text-base font-medium text-gray-700">Brand Experiment</Label>
        <p className="text-sm text-gray-500 mt-1">
          Switch between Podcast Plus and No Sweat branding, or set Auto (50/50).
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select brand…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ppp">Podcast Plus (PPP)</SelectItem>
            <SelectItem value="nsc">No Sweat (NSC)</SelectItem>
            <SelectItem value="auto">Auto 50/50</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="default" onClick={() => apply(value)}>Apply</Button>
      </div>
    </div>
  );
}
