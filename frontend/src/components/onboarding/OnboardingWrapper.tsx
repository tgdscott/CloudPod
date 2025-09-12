import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Info, HelpCircle, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";

export type OnboardingStep = {
  id: string;
  title: string;
  description?: string;
  render: () => React.ReactNode;
  validate?: () => boolean | Promise<boolean>;
  tip?: string;
};

export type OnboardingPrefs = {
  largeText: boolean;
  highContrast: boolean;
};

type Props = {
  steps: OnboardingStep[];
  index: number;
  setIndex: (n: number) => void;
  onComplete?: () => void;
  prefs: OnboardingPrefs;
};

// Lightweight fade/slide wrapper (≤200ms) with no external deps; can swap to framer-motion later
function FadeSlide({ children, keyProp }: { children: React.ReactNode; keyProp: React.Key }) {
  const [show, setShow] = useState(true);
  // re-trigger on key change
  useMemo(() => { setShow(false); const t = setTimeout(() => setShow(true), 0); return () => clearTimeout(t); }, [keyProp]);
  return (
    <div
      key={keyProp}
      className={
        "transition-all duration-200 ease-out will-change-transform " +
        (show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2")
      }
    >
      {children}
    </div>
  );
}

export default function OnboardingWrapper({ steps, index, setIndex, onComplete, prefs }: Props) {
  const step = steps[index];
  const total = steps.length;
  const pct = Math.round(((index + 1) / total) * 100);
  const isLast = index === total - 1;

  const baseText = prefs.largeText ? "text-[17px] md:text-[18px]" : "text-[15px] md:text-[16px]";
  const hc = prefs.highContrast ? "[--muted:_0_0%_0%] text-foreground" : "";

  async function handleNext() {
    if (step?.validate) {
      try {
        const ok = await step.validate();
        if (!ok) return;
      } catch (_) {
        return;
      }
    }
    if (isLast) {
      onComplete?.();
    } else {
      setIndex(index + 1);
    }
  }

  function handleBack() {
    if (index > 0) setIndex(index - 1);
  }

  return (
    <div className={`min-h-screen bg-background ${baseText} ${hc}`}>
      {/* Top header with progress */}
      <header className="border-b bg-card/40 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col gap-3">
            <h1 className="text-xl md:text-2xl font-semibold">
              New Podcast Setup
            </h1>
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                Step {index + 1} of {total} • {pct}% complete
              </div>
              <div className="w-1/2 min-w-[200px]">
                <Progress value={pct} />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content grid */}
      <main className="container mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Step content (2 cols) */}
        <section className="md:col-span-2 space-y-6">
          <div aria-live="polite" className="space-y-2">
            <h2 className="text-lg md:text-xl font-medium">{step?.title}</h2>
            {step?.description && (
              <p className="text-muted-foreground">{step.description}</p>
            )}
          </div>

          <FadeSlide keyProp={step?.id}>
            <div className="rounded-[var(--radius)] border bg-card p-4 md:p-6">
              {step?.render()}
            </div>
          </FadeSlide>

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={index === 0}
              className="rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="mr-2 h-4 w-4" /> Back
            </Button>

            <div className="flex items-center gap-2">
              {isLast && (
                <span className="text-xs text-muted-foreground hidden md:inline-flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> You’re all set after this
                </span>
              )}
              <Button
                onClick={handleNext}
                className="rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {isLast ? (
                  <>
                    Finish <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                ) : (
                  <>
                    Continue <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </section>

        {/* Right rail (1 col) */}
        <aside className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 pb-2">
              <Info className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Helpful tip</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {step?.tip || "Short and sweet: you can change this later in Settings."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2 pb-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Need a hand?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                We’re here to help. Browse quick guides or reach out.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="rounded-[var(--radius)]" asChild>
                  <a href="/help" target="_blank" rel="noreferrer">Guides</a>
                </Button>
                <Button className="rounded-[var(--radius)]" asChild>
                  <a href="mailto:support@example.com">Contact</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}

export { OnboardingWrapper };
