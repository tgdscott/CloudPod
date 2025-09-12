import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Send, Bot, User, ArrowLeft, Lightbulb } from 'lucide-react';

export default function TemplateWizard({ user, token, onBack, onTemplateCreated }) {
  // Preview-only: calm copy and tip; chat disabled for now
  const [history, setHistory] = useState([
    { role: 'assistant', content: (
      "AI Template Wizard is coming soon.\n\n" +
      "Soon you'll be able to:\n" +
      "• Describe your show in plain language.\n" +
      "• Get a draft template with segments and timing.\n" +
      "• Edit details before saving.\n\n" +
      "Tip: You can change templates later. Your work is safe.\n\n" +
      "For now, please use the manual Template Builder."
    ) }
  ]);
  const [userInput, setUserInput] = useState('');
  const messagesEndRef = useRef(null);
  const headingRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [history]);

  // Focus heading on mount for accessibility
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  // Disabled: ignore send attempts
  const handleSend = () => {
    return;
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex justify-center items-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-wizard-heading"
    >
      <Card className="w-full max-w-2xl h-full max-h-[90vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle id="template-wizard-heading" tabIndex={-1} ref={headingRef} className="flex items-center gap-2 outline-none">
            <Bot aria-hidden className="w-5 h-5" />
            Template Wizard (preview)
          </CardTitle>
          <Button variant="ghost" onClick={onBack} className="h-11 min-h-[44px] px-3">
            <ArrowLeft className="w-4 h-4 mr-2" aria-hidden />
            Back
          </Button>
        </CardHeader>
        <CardContent className="flex-grow overflow-y-auto p-4 space-y-4">
          {/* Live announcement */}
          <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
            AI Template Wizard is coming soon.
          </div>

          {/* Calm explainer */}
          <div className="rounded-md border bg-muted/50 p-4">
            <div className="flex items-start gap-3">
              <Lightbulb aria-hidden className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium mb-2">What you'll be able to do</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                  <li>Describe your show in plain language.</li>
                  <li>Get a draft template with segments and timing.</li>
                  <li>Edit details before saving.</li>
                </ul>
                <p className="mt-3 text-sm text-muted-foreground">Tip: You can change templates later. Your work is safe.</p>
              </div>
            </div>
          </div>

          {/* Preserve the simple chat-like preview bubble for visual continuity */}
          {history.map((msg, index) => (
            <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && <Bot className="w-6 h-6 text-blue-500" aria-hidden />}
              <div className={`rounded-lg p-3 max-w-[80%] ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}>
                <p className="whitespace-pre-line text-sm">{msg.content}</p>
              </div>
              {msg.role === 'user' && <User className="w-6 h-6 text-gray-500" aria-hidden />}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </CardContent>
        <CardFooter className="p-4 border-t">
          <div className="flex w-full items-center gap-2">
            <Input
              disabled
              placeholder="AI Wizard is disabled (coming soon)"
              value={userInput}
              readOnly
            />
            <Button disabled variant="outline" className="h-11 min-h-[44px] px-5">
              <Send className="w-4 h-4 mr-2" aria-hidden />
              Send
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}