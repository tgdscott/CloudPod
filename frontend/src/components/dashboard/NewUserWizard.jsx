import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from "@/hooks/use-toast";
import { makeApi } from '@/lib/apiClient';
import { CheckCircle } from 'lucide-react';

const WizardStep = ({ children }) => <div className="py-4">{children}</div>;

const NewUserWizard = ({ open, onOpenChange, token, onPodcastCreated }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    podcastName: '',
    podcastDescription: '',
    coverArt: null,
    elevenlabsApiKey: '',
  });
  const [isSpreakerConnected, setIsSpreakerConnected] = useState(false);
  const { toast } = useToast();

  const pollRef = useRef(null);
  const announceConnected = useCallback(() => {
    setIsSpreakerConnected(prev => {
      if (!prev) {
        toast({ title: "Success!", description: "Your Spreaker account is now connected." });
      }
      return true;
    });
  }, [toast]);

  const verifyConnection = useCallback(async () => {
    if (!token) return false;
    try {
      const user = await makeApi(token).get('/api/auth/users/me');
      if (user?.spreaker_access_token) {
        announceConnected();
        return true;
      }
    } catch (_) {}
    return false;
  }, [announceConnected, token]);

  // Feature flag: hide BYOK (Bring Your Own Key) for ElevenLabs for now.
  // Toggle with VITE_ENABLE_BYOK=true if we want to re-enable the step.
  const ENABLE_BYOK = (import.meta.env?.VITE_ENABLE_BYOK === 'true');

  const wizardSteps = [
    { id: 'welcome', title: 'Welcome' },
    { id: 'showDetails', title: 'About your show' },
    { id: 'coverArt', title: 'Podcast Cover Art (optional)' },
    { id: 'spreaker', title: 'Connect hosting' },
    ...(
      ENABLE_BYOK
        ? [{ id: 'elevenlabs', title: 'AI voices (optional)' }]
        : []
    ),
    { id: 'finish', title: 'All set' },
  ];
  const totalSteps = wizardSteps.length;
  const stepId = wizardSteps[step - 1]?.id;

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (data === 'spreaker_connected' || (data && data.type === 'spreaker_connected')) {
        announceConnected();
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        verifyConnection().catch(() => {});
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [announceConnected, verifyConnection]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const nextStep = () => setStep((prev) => Math.min(prev + 1, totalSteps));
  const prevStep = () => setStep((prev) => Math.max(prev - 1, 1));

  const handleChange = (e) => {
    const { id, value, files } = e.target;
    setFormData((prev) => ({ ...prev, [id]: files ? files[0] : value }));
  };

  const handleConnectSpreaker = async () => {
    try {
      const { auth_url } = await makeApi(token).get('/api/spreaker/auth/login');
      if (!auth_url) throw new Error('Could not start the Spreaker sign-in.');
      const popup = window.open(auth_url, 'spreakerAuth', 'width=600,height=700');
      if (!popup) throw new Error('Popup blocked. Please allow popups and try again.');
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      pollRef.current = setInterval(async () => {
        if (!popup || popup.closed) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          await verifyConnection();
        }
      }, 1000);
    } catch (error) {
      toast({ title: 'Connection Error', description: error?.message || 'Could not connect to Spreaker.', variant: 'destructive' });
    }
  };

  const handleFinish = async () => {
    try {
      if (formData.elevenlabsApiKey) {
        try { await makeApi(token).put('/api/users/me/elevenlabs-key', { api_key: formData.elevenlabsApiKey }); } catch { try { toast({ variant: 'destructive', title: 'ElevenLabs key not saved', description: 'You can add it later in Settings.' }); } catch {} }
      }

      const podcastPayload = new FormData();
      podcastPayload.append('name', formData.podcastName);
      podcastPayload.append('description', formData.podcastDescription);
      if (formData.coverArt) {
        podcastPayload.append('cover_image', formData.coverArt);
      }

      const podcastRes = await makeApi(token).raw('/api/podcasts/', { method: 'POST', body: podcastPayload });
      if (podcastRes && podcastRes.status && podcastRes.status >= 400) { const errorData = podcastRes; throw new Error(errorData.detail || 'Failed to create the podcast show.'); }
      const newPodcast = podcastRes;

  toast({ title: "Success!", description: "Your new podcast show has been created." });
      onPodcastCreated(newPodcast); // Pass the new podcast object back to the parent

    } catch (error) {
      toast({ title: "An Error Occurred", description: error.message, variant: "destructive" });
    } finally {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Let's Create Your First Podcast! (Step {step})</DialogTitle>
        </DialogHeader>

  {stepId === 'welcome' && (
          <WizardStep>
            <h3 className="text-lg font-semibold mb-2">Welcome</h3>
            <p className="text-sm text-gray-600">
              We’ll guide you one step at a time. You can’t break anything, and we save as you go.
            </p>
          </WizardStep>
        )}

  {stepId === 'showDetails' && (
          <WizardStep>
            <h3 className="text-lg font-semibold mb-2">About your show</h3>
            <DialogDescription className="mb-4">
              Tell us the name and what it’s about. You can change this later.
            </DialogDescription>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="podcastName" className="text-right">Name</Label>
                <Input id="podcastName" value={formData.podcastName} onChange={handleChange} className="col-span-3" placeholder="e.g., 'The Morning Cup'" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="podcastDescription" className="text-right">Description</Label>
                <Textarea id="podcastDescription" value={formData.podcastDescription} onChange={handleChange} className="col-span-3" placeholder="e.g., 'A daily podcast about the latest tech news.'" />
              </div>
            </div>
          </WizardStep>
        )}

  {stepId === 'coverArt' && (
          <WizardStep>
            <h3 className="text-lg font-semibold mb-2">Cover art</h3>
            <DialogDescription className="mb-2">
              Upload a square image (at least 1400×1400). We’ll preview how it looks.
            </DialogDescription>
            <p className="text-xs text-gray-500 mb-4">No artwork yet? You can skip and add it later.</p>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="coverArt" className="text-right">Image</Label>
              <Input id="coverArt" type="file" onChange={handleChange} className="col-span-3" accept="image/png, image/jpeg" />
            </div>
          </WizardStep>
        )}

  {stepId === 'spreaker' && (
          <WizardStep>
            <h3 className="text-lg font-semibold mb-2">Connect hosting</h3>
            <DialogDescription className="mb-2">
              We partner with Spreaker to host your podcast.
            </DialogDescription>
            <p className="text-xs text-gray-500 mb-4">Keep your phone nearby in case a code is needed.</p>
            <div className="flex justify-center items-center p-6 bg-gray-50 rounded-md">
              {isSpreakerConnected ? (
                <Button variant="secondary" disabled className="bg-green-500 text-white hover:bg-green-500">
                  <CheckCircle className="w-5 h-5 mr-2" />
                  Connected
                </Button>
              ) : (
                <Button onClick={handleConnectSpreaker}>Connect to Spreaker</Button>
              )}
            </div>
          </WizardStep>
        )}

  {stepId === 'elevenlabs' && (
          <WizardStep>
            <h3 className="text-lg font-semibold mb-2">AI voices (optional)</h3>
            <DialogDescription className="mb-2">
              Want AI voices? You can always turn this on later.
            </DialogDescription>
            <p className="text-xs text-gray-500 mb-4">If you’re not sure, choose ‘Skip’—you won’t lose anything.</p>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="elevenlabsApiKey" className="text-right">ElevenLabs API Key</Label>
              <Input id="elevenlabsApiKey" type="password" value={formData.elevenlabsApiKey} onChange={handleChange} className="col-span-3" placeholder="(Optional) Paste your key here" />
            </div>
          </WizardStep>
        )}

  {stepId === 'finish' && (
          <WizardStep>
            <h3 className="text-lg font-semibold mb-2">All set</h3>
            <p className="text-sm text-gray-600 mb-1">Nice work. You can publish now or explore your dashboard first.</p>
            <p className="text-xs text-gray-500">There’s a short tour on the next screen if you’d like it.</p>
          </WizardStep>
        )}

        <DialogFooter>
          {step > 1 && <Button variant="outline" onClick={prevStep}>Back</Button>}
          {step < totalSteps && <Button onClick={nextStep}>Continue</Button>}
          {step === totalSteps && <Button onClick={handleFinish}>Finish</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewUserWizard;
