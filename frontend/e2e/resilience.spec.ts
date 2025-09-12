import { test, expect } from '@playwright/test';

// Utility to stub JSON responses
function json(data: any, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  } as const;
}

test.describe('Resilience: TTS 429, LLM 500, upload retry, minutes not refunded', () => {
  test('handles failures gracefully and preserves minutes UI', async ({ page }) => {
    // Debug logging to surface issues in CI output
    page.on('console', (msg) => {
      // eslint-disable-next-line no-console
      console.log(`[console:${msg.type()}]`, msg.text());
    });
    page.on('pageerror', (err) => {
      // eslint-disable-next-line no-console
      console.log('[pageerror]', err.message);
    });
    page.on('requestfailed', (req) => {
      // eslint-disable-next-line no-console
      console.log('[requestfailed]', req.url(), req.failure()?.errorText);
    });

    // Ensure the app considers us authenticated and in draft mode for determinism
    await page.addInitScript(() => {
      try { window.localStorage.setItem('authToken', 'e2e-token'); } catch {}
      try { window.localStorage.setItem('ppp_publish_mode', 'draft'); } catch {}
    });

    // Common routes
    await page.route('**/api/users/me', (route) => route.fulfill(json({ id: 'u1', email: 'user@example.com', first_name: 'Test', is_admin: false })));
    await page.route('**/api/admin/settings', (route) => route.fulfill(json({ test_mode: true })));
    await page.route('**/api/users/me/capabilities', (route) => route.fulfill(json({ has_elevenlabs: true, has_google_tts: false, has_any_sfx_triggers: false })));
    // Minutes usage: used 120 of 1000 => remaining 880
    const usage = { processing_minutes_used_this_month: 120, max_processing_minutes_month: 1000 };
    await page.route('**/api/billing/usage', (route) => route.fulfill(json(usage)));
    await page.route('**/api/users/me/stats', (route) => route.fulfill(json({ episodes_last_30d: 0, upcoming_scheduled: 0 })));
    await page.route('**/api/notifications/**', (route) => route.fulfill(json([])));
    await page.route('**/api/recurring/schedules', (route) => {
      if (route.request().method() === 'GET') return route.fulfill(json([]));
      return route.fulfill(json({ ok: true }));
    });
    await page.route('**/api/media/', (route) => route.fulfill(json([])));

    // Provide a template with a TTS segment so Step 3 shows voice controls
  const template = {
      id: 'tpl1',
      name: 'Tpl One',
      description: 'Demo',
      podcast_id: 'pod1',
      ai_settings: { auto_fill_ai: true, auto_generate_tags: true },
      segments: [
    { id: 'seg-intro', segment_type: 'intro', source: { source_type: 'tts', voice_id: 'v1', text_prompt: 'Welcome line' } },
    { id: 'seg-content', segment_type: 'content', source: { source_type: 'content' } },
      ],
    };
    await page.route('**/api/templates/', (route) => route.fulfill(json([template])));
    await page.route('**/api/templates/tpl1', (route) => route.fulfill(json(template)));
    await page.route('**/api/podcasts/', (route) => route.fulfill(json([{ id: 'pod1', title: 'My Show' }])));
    await page.route('**/api/episodes/last/numbering', (route) => route.fulfill(json({ season_number: 1, episode_number: 9 })));

    // Upload main content: first attempt fails with a network drop, second succeeds
    let uploadHits = 0;
    await page.route('**/api/media/upload/main_content', async (route) => {
      uploadHits += 1;
      if (uploadHits === 1) {
        await route.abort('failed');
      } else {
        await route.fulfill(json([{ filename: 'in.wav', friendly_name: 'in.wav' }]));
      }
    });

    // Flubber prepare returns empty (no scan found)
    await page.route('**/api/flubber/prepare-by-file', (route) => route.fulfill(json({ contexts: [] })));

    // Transcript readiness and AI metadata
    await page.route('**/api/ai/transcript-ready**', (route) => route.fulfill(json({ ready: true })));
    // Title ok, Notes 500 to trigger fallback toast
    await page.route('**/api/ai/title', (route) => route.fulfill(json({ title: 'Resilient Title' })));
    await page.route('**/api/ai/notes', (route) => route.fulfill(json({ message: 'Internal error' }, 500)));
    await page.route('**/api/ai/tags', (route) => route.fulfill(json({ tags: ['alpha', 'beta'] })));

    // TTS voices endpoint: first call 429, subsequent return voices
    let voicesHits = 0;
    await page.route('**/api/elevenlabs/voices**', (route) => {
      voicesHits += 1;
      if (voicesHits === 1) {
        return route.fulfill({ status: 429, body: 'Rate limited' });
      }
      return route.fulfill(json({ total: 1, items: [{ voice_id: 'v1', name: 'Alex', common_name: 'Alex', labels: { gender: 'male' } }] }));
    });

    // Assemble and status
    await page.route('**/api/episodes/assemble', (route) => route.fulfill(json({ job_id: 'job-77', episode_id: 'ep-77' })));
    let statusHits = 0;
    await page.route('**/api/episodes/status/job-77', (route) => {
      statusHits += 1;
      if (statusHits < 2) return route.fulfill(json({ status: 'queued' }));
      return route.fulfill(json({ status: 'processed', episode: { id: 'ep-77', title: 'Resilient Title', description: 'Desc', final_audio_url: 'https://example.com/ep77.mp3' } }));
    });

    // Publish draft routes (invoked post-assembly if user publishes manually; here we stay in draft)
    await page.route('**/api/episodes/ep-77/publish', (route) => route.fulfill(json({ message: 'Episode saved as draft.' })));
    await page.route('**/api/episodes/ep-77/publish/status', (route) => route.fulfill(json({ spreaker_episode_id: 'spk-77' })));

  // Episode History list & delete
  await page.route('**/api/episodes/?*', (route) => route.fulfill(json([{ id: 'ep-77', title: 'Resilient Title', status: 'processed', published_at: null }])));
  await page.route('**/api/episodes/', (route) => route.fulfill(json([{ id: 'ep-77', title: 'Resilient Title', status: 'processed', published_at: null }])));
    await page.route('**/api/episodes/ep-77', (route) => {
      if (route.request().method() === 'DELETE') return route.fulfill(json({ ok: true }));
      return route.fulfill(json({ id: 'ep-77', title: 'Resilient Title', status: 'processed' }));
    });

    // Go to app
    await page.goto('/');

    // Navigate to Episode Creator
    await expect(page.getByRole('button', { name: /New Episode/i })).toBeVisible();
    await page.getByRole('button', { name: /New Episode/i }).click();
    await expect(page.getByRole('heading', { name: /Episode Creator/i })).toBeVisible();

    // Step 2: upload - first attempt fails (network drop), then retry
    const chooseBtn = page.getByRole('button', { name: /Choose Audio File/i });
    const doUpload = async () => {
      const fileChooserPromise = page.waitForEvent('filechooser');
      await chooseBtn.click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({ name: 'in.wav', mimeType: 'audio/wav', buffer: Buffer.from([82,73,70,70,0,0,0,0,87,65,86,69]) });
    };
    await doUpload(); // 1st attempt will fail
    // Expect an error surfaced in UI – proceed to retry by re-selecting the file
    await doUpload(); // 2nd attempt succeeds

    // Intent modal → Continue if shown
    const continueBtn = page.getByRole('button', { name: /^Continue$/i });
    if (await continueBtn.isVisible()) await continueBtn.click();

  // Step 3: Voice Picker — ensure present and opens; voices may load after initial 429
  const changeVoiceBtn = page.getByRole('button', { name: /Change voice/i });
  await expect(changeVoiceBtn).toBeVisible();
  await changeVoiceBtn.click();
  const search = page.getByPlaceholder(/Search voices by name or label/i);
  await search.fill('al');
  await expect(page.getByText('Alex')).toBeVisible();
    // Close voice picker
    await page.getByRole('button', { name: /^Close$/i }).click();

  // Proceed to Step 4
  await page.getByRole('button', { name: /Continue to Details/i }).click();

    // Step 4: Skip cover
    const skipBtn = page.getByRole('button', { name: /^Skip$/i });
    if (await skipBtn.isVisible()) await skipBtn.click();

    // Step 5: trigger LLM 500 on AI Description
    const descBtn = page.getByRole('button', { name: /AI Suggest Description/i });
  await descBtn.click();
  // Expect a generic error toast for description (scope to toaster container)
  const toaster = page.locator('[role="status"]').first();
  await expect(toaster.getByText('AI Description error')).toBeVisible();

    // Fill required fields minimally
    const titleInput = page.getByLabel('Episode Title *');
    if (!(await titleInput.inputValue())) await titleInput.fill('Resilient Title');
    const epNum = page.getByLabel('Episode Number *');
    if (!(await epNum.inputValue())) await epNum.fill('10');

    // Assemble
    const assembleBtn = page.getByRole('button', { name: /Assemble & Review/i });
    await expect(assembleBtn).toBeEnabled();
    await assembleBtn.click();
    // Wait for processed state (Step 6)
    await expect(page.locator('text=Step 6: Draft Ready').first()).toBeVisible({ timeout: 30000 });

    // Minutes banner should show remaining 880
    await expect(page.getByText(/Processing minutes remaining this month:/i)).toBeVisible();
    await expect(page.getByText(/880\b/)).toBeVisible();

  // Back to Dashboard
    // Prefer the primary Back to Dashboard button in Step 6 content area
    const backToDashboard = page.locator('main, [data-step="6"], body').getByRole('button', { name: /Back to Dashboard/i }).first();
    if (await backToDashboard.isVisible()) {
      await backToDashboard.click();
    } else {
      await page.getByRole('button', { name: /Back to Dashboard/i }).nth(1).click().catch(()=>{});
    }

        // Go to Episode History and delete processed episode
      const historyBtn = page.getByRole('button', { name: /^History$/i }).first();
        if (await historyBtn.isVisible()) {
          await historyBtn.click();
          await expect(page.getByText(/Episode History/i)).toBeVisible();
      page.once('dialog', (dialog) => dialog.accept());
          const delFirst = page.getByTitle(/Delete episode/i).first();
          if (await delFirst.isVisible()) await delFirst.click();
      // Click Back to return to dashboard
      const backBtn = page.getByRole('button', { name: /^Back$/i }).first();
      if (await backBtn.isVisible()) await backBtn.click();
        }

        // Start a new episode flow again (ensure minutes remaining UI unchanged)
    const newEpBtn = page.getByRole('button', { name: /New Episode/i });
    await newEpBtn.click();
    await expect(page.getByRole('heading', { name: /Episode Creator/i })).toBeVisible();

    // Ensure the minutes remaining banner has not changed (still 880)
    await expect(page.getByText(/Processing minutes remaining this month:/i)).toBeVisible();
    await expect(page.getByText(/880\b/)).toBeVisible();
  });
});
