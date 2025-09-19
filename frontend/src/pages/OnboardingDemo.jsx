import React, { useState } from "react";
import OnboardingWrapper from "@/components/onboarding/OnboardingWrapper.jsx";
import { useComfort } from '@/ComfortContext.jsx';

export default function OnboardingDemo() {
  const [index, setIndex] = useState(0);
  const { largeText, setLargeText, highContrast, setHighContrast } = useComfort();
  const steps = [
    {
      id: "welcome",
      title: "Pick a show name",
      description: "You can change this later.",
      render: () => <div className="space-y-2"><label className="text-sm">Show name</label><input className="w-full border rounded-[var(--radius)] p-2" placeholder="My Great Show" /></div>,
      validate: () => true,
      tip: "Short names are easier to remember.",
    },
    {
      id: "artwork",
      title: "Add artwork",
      description: "Drop in a square image for best results.",
      render: () => <div className="p-6 border-2 border-dashed rounded-[var(--radius)] text-sm text-muted-foreground">Drag & drop image here</div>,
      validate: () => true,
      tip: "At least 1400x1400px is recommended.",
    },
    {
      id: "publish",
      title: "Choose a publish day",
      description: "We'll remind you before each release.",
      render: () => <div className="space-x-2"><button className="btn">Mon</button><button className="btn">Wed</button><button className="btn">Fri</button></div>,
      validate: () => true,
      tip: "Consistency beats volume.",
    },
  ];

  return (
    <OnboardingWrapper
      steps={steps}
      index={index}
      setIndex={setIndex}
      onComplete={() => alert("Done!")}
      prefs={{
        largeText,
        setLargeText,
        highContrast,
        setHighContrast,
      }}
    />
  );
}
