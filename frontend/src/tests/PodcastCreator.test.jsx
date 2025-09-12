import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PodcastCreator from '@/components/dashboard/PodcastCreator';
import { server } from './testServer';
import { http, HttpResponse } from 'msw';
import { resetCounts, getCount } from './testHandlers';
import { Toaster } from '@/components/ui/toaster.jsx';

const token = 'test-token';
const templates = [{ id: 'tpl1', name: 'Tpl One', podcast_id: 'pod1', ai_settings: { auto_fill_ai: true } }];

function renderCreator(extraProps={}){
  return render(<>
    <PodcastCreator onBack={() => {}} token={token} templates={templates} podcasts={[]} {...extraProps} />
    <Toaster />
  </>);
}

beforeEach(() => { resetCounts(); });

describe('PodcastCreator AI autofill and manual suggest behavior', () => {
  it('does not auto-inject tags when template disables auto_generate_tags and manual tags persist across reload', async () => {
    // Template with auto_generate_tags=false
    const tpl = { id: 'tplX', name: 'Tpl Tags Off', podcast_id: 'pod1', ai_settings: { auto_fill_ai: false, auto_generate_tags: false } };
  const { unmount } = renderCreator({ templates:[tpl], initialStep:5, testInject:{ selectedTemplate: tpl, uploadedFilename:'in.wav', transcriptReady:true, episodeDetails: { tags: '' } } });

    // Confirm no AI tags have been injected automatically
  const tagsBox = await screen.findByLabelText(/tags/i, { selector: 'textarea' });
    expect(tagsBox.value).toBe('');

    // User types manual tags
    fireEvent.change(tagsBox, { target: { value: 'custom1, custom2' } });
    expect(tagsBox.value).toBe('custom1, custom2');

  // Simulate reload by fully unmounting and re-rendering fresh
  unmount();
  renderCreator({ templates:[tpl], initialStep:5, testInject:{ selectedTemplate: tpl, uploadedFilename:'in.wav', transcriptReady:true } });
  const tagsBox2 = await screen.findByLabelText(/tags/i, { selector: 'textarea' });
  // Still no AI injection and no carry-over from previous render
  expect(tagsBox2.value).toBe('');
  // Verify no AI tags call was made when auto_generate_tags is false
  expect(getCount('ai_tags')).toBe(0);
  });
  it('disables Title/Description buttons while autofill runs on Step 5 when auto_fill_ai is true', async () => {
    server.use(
      http.post('/api/ai/title', () => new Promise(r => setTimeout(() => r(HttpResponse.json({ title: 'AutoTitle' })), 60))),
      http.post('/api/ai/notes', () => new Promise(r => setTimeout(() => r(HttpResponse.json({ description: 'AutoDesc' })), 60)))
    );
    const selectedTemplate = { id: 'tpl1', name: 'Tpl One', podcast_id: 'pod1', ai_settings: { auto_fill_ai: true } };
  renderCreator({ templates:[selectedTemplate], initialStep:5, testInject:{ selectedTemplate, uploadedFilename:'in.wav', transcriptReady:true } });

    const titleBtn = await screen.findByRole('button', { name: /ai suggest title/i });
    const descBtn = await screen.findByRole('button', { name: /ai suggest description/i });
    expect(!!titleBtn).toBe(true);
    expect(!!descBtn).toBe(true);
    await waitFor(() => {
      expect(titleBtn.hasAttribute('disabled')).toBe(true);
      expect(descBtn.hasAttribute('disabled')).toBe(true);
    });
  });

  it('Manual suggest: double-click fires exactly one network call and disables during fetch', async () => {
    let calls = 0;
    server.use(
      http.post('/api/ai/title', async () => {
        calls += 1;
        return new Promise((resolve) => setTimeout(() => resolve(HttpResponse.json({ title: 'T1' })), 60));
      })
    );
    const selectedTemplate = { id: 'tpl1', name: 'Tpl One', podcast_id: 'pod1', ai_settings: { auto_fill_ai: false } };
    renderCreator({ templates:[selectedTemplate], initialStep:5, testInject:{ selectedTemplate, uploadedFilename:'in.wav', transcriptReady:true } });

    const titleBtn = await screen.findByRole('button', { name: /ai suggest title/i });
    // Wait until transcriptReady polling re-enables the button
    await waitFor(() => { expect(titleBtn.hasAttribute('disabled')).toBe(false); });
    fireEvent.click(titleBtn);
    fireEvent.click(titleBtn);
    await waitFor(() => { expect(titleBtn.hasAttribute('disabled')).toBe(true); });
    await waitFor(() => { expect(calls).toBe(1); });
  });

  it('shows error toast on 429/500 without leaking details', async () => {
    server.use(
      http.post('/api/ai/title', () => HttpResponse.json({ message: 'Rate limited' }, { status: 429 })),
      http.post('/api/ai/notes', () => HttpResponse.json({ message: 'Server error' }, { status: 500 }))
    );
    const selectedTemplate = { id: 'tpl1', name: 'Tpl One', podcast_id: 'pod1', ai_settings: { auto_fill_ai: false } };
    renderCreator({ templates:[selectedTemplate], initialStep:5, testInject:{ selectedTemplate, uploadedFilename:'in.wav', transcriptReady:true } });

    const titleBtn = await screen.findByRole('button', { name: /ai suggest title/i });
    const descBtn = await screen.findByRole('button', { name: /ai suggest description/i });
    await waitFor(() => { expect(titleBtn.hasAttribute('disabled')).toBe(false); });
  fireEvent.click(titleBtn);
  await screen.findByText(/AI Title error/i);
  expect(!!screen.getByText(/Too many requests/i)).toBe(true);
    await waitFor(() => { expect(descBtn.hasAttribute('disabled')).toBe(false); });
  fireEvent.click(descBtn);
  await screen.findByText(/AI Description error/i);
  expect(!!screen.getByText(/Request failed/)).toBe(true);
  });
});
