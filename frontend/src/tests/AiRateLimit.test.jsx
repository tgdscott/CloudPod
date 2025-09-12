import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PodcastCreator from '@/components/dashboard/PodcastCreator';
import { server } from './testServer';
import { http, HttpResponse } from 'msw';
import { Toaster } from '@/components/ui/toaster.jsx';

const token = 'test-token';
const templates = [{ id: 'tpl1', name: 'Tpl One', podcast_id: 'pod1', ai_settings: { auto_fill_ai: false } }];

function renderCreator(extraProps={}){
  return render(<>
    <PodcastCreator onBack={() => {}} token={token} templates={templates} podcasts={[]} {...extraProps} />
    <Toaster />
  </>);
}

describe('AI rate limiting UX', () => {
  it('shows friendly slow-down on 429, then succeeds on retry without duplicate toasts', async () => {
    let hit = 0;
    server.use(
      http.post('/api/ai/title', () => {
        hit += 1;
        if (hit === 1) return HttpResponse.json({ message: 'Rate limited' }, { status: 429, headers: { 'Retry-After': '1' } });
        return HttpResponse.json({ title: 'AfterBackoff' });
      })
    );

    renderCreator({ initialStep:5, testInject:{ selectedTemplate: templates[0], uploadedFilename:'in.wav', transcriptReady:true } });

    const titleBtn = await screen.findByRole('button', { name: /ai suggest title/i });
    await waitFor(() => { expect(titleBtn.hasAttribute('disabled')).toBe(false); });

  // First click -> 429
  fireEvent.click(titleBtn);
  // Assert friendly toast appears
  const toast1 = await screen.findByText(/AI Title error/i);
    expect(toast1).toBeTruthy();
  // Friendly description present, no server-provided raw detail leaked
  expect(await screen.findByText(/Too many requests/i)).toBeTruthy();
  expect(screen.queryByText(/Rate limited/i)).toBeNull();

  // Allow UI to settle before retry
  await new Promise(r => setTimeout(r, 10));

  // Retry manually
  fireEvent.click(titleBtn);
  await screen.findByDisplayValue('AfterBackoff');

  // Ensure only one toast root is present (open notifications)
  const toastRoots = document.querySelectorAll('[role="status"][data-state="open"], [data-sonner-toast], [data-state="open"].group');
  expect(toastRoots.length <= 1).toBe(true);
  });
});
