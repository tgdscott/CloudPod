import { test, expect } from '@playwright/test';

// Utility to stub JSON responses
function json(data: any, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  } as const;
}

test.describe('Onboarding → Upload → Transcript Ready → Assemble → Publish', () => {
  test('happy path with network stubs', async ({ page }) => {
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
    // Ensure the app considers us authenticated
    await page.addInitScript(() => {
      try { window.localStorage.setItem('authToken', 'e2e-token'); } catch {}
      try { window.localStorage.setItem('ppp_publish_mode', 'draft'); } catch {}
    });

    // Route mocks for backend endpoints consumed by the app and dashboard
    await page.route('**/api/users/me', route => route.fulfill(json({ id: 'u1', email: 'user@example.com', first_name: 'Test', is_admin: false })));
  await page.route('**/api/admin/settings', route => route.fulfill(json({ test_mode: true })));
    await page.route('**/api/users/me/capabilities', route => route.fulfill(json({ has_elevenlabs:false, has_google_tts:false, has_any_sfx_triggers:false })));
    await page.route('**/api/billing/usage', route => route.fulfill(json({ processing_minutes_used_this_month: 0, max_processing_minutes_month: 1000 })));
    await page.route('**/api/users/me/stats', route => route.fulfill(json({ episodes_last_30d: 0, upcoming_scheduled: 0 })));
    await page.route('**/api/notifications/**', route => route.fulfill(json([])));
    await page.route('**/api/recurring/schedules', route => {
      if (route.request().method() === 'GET') return route.fulfill(json([]));
      return route.fulfill(json({ ok: true }));
    });
    await page.route('**/api/media/', route => route.fulfill(json([])));
  await page.route('**/api/templates/', route => {
      // Return a single template to enable creation
      const tpl = {
        id: 'tpl1',
        name: 'Tpl One',
        description: 'Demo',
        podcast_id: 'pod1',
        ai_settings: { auto_fill_ai: true, auto_generate_tags: true },
        segments: [
          { id: 'seg-content', segment_type: 'content', source: { source_type: 'content' } },
        ],
      };
      return route.fulfill(json([tpl]));
    });
    await page.route('**/api/templates/tpl1', route => {
      const tpl = {
        id: 'tpl1',
        name: 'Tpl One',
        description: 'Demo',
        podcast_id: 'pod1',
        ai_settings: { auto_fill_ai: true, auto_generate_tags: true },
        segments: [
          { id: 'seg-content', segment_type: 'content', source: { source_type: 'content' } },
        ],
      };
      return route.fulfill(json(tpl));
    });
    await page.route('**/api/podcasts/', route => route.fulfill(json([{ id: 'pod1', title: 'My Show' }])));
    await page.route('**/api/episodes/last/numbering', route => route.fulfill(json({ season_number: 1, episode_number: 41 })));

    // Upload main content
    await page.route('**/api/media/upload/main_content', route => route.fulfill(json([{ filename: 'in.wav', friendly_name: 'in.wav' }])));

    // Flubber prepare: return 425 twice then success with no contexts
    let flubberHits = 0;
    await page.route('**/api/flubber/prepare-by-file', route => {
      flubberHits += 1;
      if (flubberHits < 3) {
        return route.fulfill({ status: 425, body: 'Too Early' });
      }
      return route.fulfill(json({ contexts: [] }));
    });

    // Transcript readiness and AI metadata
    await page.route('**/api/ai/transcript-ready**', route => route.fulfill(json({ ready: true })));
    await page.route('**/api/ai/title', route => route.fulfill(json({ title: 'Suggested Title' })));
    await page.route('**/api/ai/notes', route => route.fulfill(json({ description: 'Suggested Description' })));
    await page.route('**/api/ai/tags', route => route.fulfill(json({ tags: ['alpha', 'beta'] })));

    // Assemble
    await page.route('**/api/episodes/assemble', route => route.fulfill(json({ job_id: 'job-1', episode_id: 'ep-1' })));
    let statusHits = 0;
    await page.route('**/api/episodes/status/job-1', route => {
      statusHits += 1;
      // eslint-disable-next-line no-console
      console.log('[stub] status hit', statusHits);
      if (statusHits < 2) return route.fulfill(json({ status: 'queued' }));
      return route.fulfill(json({ status: 'processed', episode: { id: 'ep-1', title: 'Suggested Title', description: 'Suggested Description', final_audio_url: 'https://example.com/ep.mp3' } }));
    });
    await page.route('**/api/episodes/status/**', route => {
      // Fallback in case pattern differs
      return route.fulfill(json({ status: 'processed', episode: { id: 'ep-1', title: 'Suggested Title', description: 'Suggested Description', final_audio_url: 'https://example.com/ep.mp3' } }));
    });

    // Publish
    await page.route('**/api/episodes/ep-1/publish', route => route.fulfill(json({ message: 'Episode published publicly.' })));
    await page.route('**/api/episodes/ep-1/publish/status', route => route.fulfill(json({ spreaker_episode_id: 'spk-123' })));

  // Navigate to app
    await page.goto('/');

  // Navigate from Dashboard to Episode Creator
  await expect(page.getByRole('button', { name: /New Episode/i })).toBeVisible();
  await page.getByRole('button', { name: /New Episode/i }).click();
  await expect(page.getByRole('heading', { name: /Episode Creator/i })).toBeVisible();

    // Step 2: Upload audio
    // Click Choose Audio File button and set the file
    const chooseBtn = page.getByRole('button', { name: /Choose Audio File/i });
    if (await chooseBtn.isVisible()) {
      const fileChooserPromise = page.waitForEvent('filechooser');
      await chooseBtn.click();
      const fileChooser = await fileChooserPromise;
      // Create a tiny blob to simulate in.wav
      await fileChooser.setFiles({ name: 'in.wav', mimeType: 'audio/wav', buffer: Buffer.from([82,73,70,70,0,0,0,0,87,65,86,69]) });
    }

    // Intent questions modal appears → Continue with defaults
    // Continue from intent modal if present; otherwise proceed
    const continueBtn = page.getByRole('button', { name: /^Continue$/i });
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    }

    // Step 3: Continue to Details
    await page.getByRole('button', { name: /Continue to Details/i }).click();

    // Step 4: Skip cover
    const skipBtn = page.getByRole('button', { name: /^Skip$/i });
    if (await skipBtn.isVisible()) await skipBtn.click();

  // Step 5: Details & Schedule — use AI button to fill title
  const titleInput = page.getByLabel('Episode Title *');
  await expect(titleInput).toBeVisible();
  const aiTitleBtn = page.getByRole('button', { name: /AI Suggest Title/i });
  await expect(aiTitleBtn).toBeEnabled();
  await aiTitleBtn.click();
  await expect(titleInput).toHaveValue(/Suggested Title/i);

    // Fill minimal required fields if needed
    const epNum = page.getByLabel('Episode Number *');
    if (await epNum.inputValue() === '') await epNum.fill('42');

  // Ensure publish mode is draft for deterministic UI
  const draftRadio = page.getByRole('radio', { name: /draft/i });
  if (await draftRadio.isVisible()) await draftRadio.check();

  // Assemble
    const assembleBtn = page.getByRole('button', { name: /Assemble & Review/i });
    await expect(assembleBtn).toBeEnabled();
    await assembleBtn.click();
    // Step 6: Assembly In Progress
    // Some UI wraps heading differently, so check either heading or body text
    const progressHeading = page.getByRole('heading', { name: /Assembly In Progress/i });
    await Promise.race([
      progressHeading.waitFor({ state: 'visible' }),
      page.getByText(/Assembling your episode|has been queued/i).waitFor({ state: 'visible' })
    ]);
    // Wait for completion state (processed)
  // Scope to the Step 6 card content container to avoid duplicate matches
  // Verify Step 6 shows Draft Ready
  await expect(page.locator('text=Step 6: Draft Ready').first()).toBeVisible({ timeout: 30000 });

  // Final assertion: Step 6 shows the draft summary message
  await expect(page.getByText('Episode saved as draft.')).toBeVisible();
  });
});
