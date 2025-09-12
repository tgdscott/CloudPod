import { test, expect } from '@playwright/test';
import { runAxe, assertTabFocusOrder, expectMinFont } from './a11y-helpers';

function json(data: any, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(data) } as const;
}

test.describe('A11y scans: Onboarding, Episode Creator (Step 5), Admin', () => {
  test.beforeEach(async ({ page }) => {
    // Default auth and usage
    await page.addInitScript(() => {
      try { window.localStorage.setItem('authToken', 'e2e-token'); } catch {}
      try { window.localStorage.setItem('ppp_publish_mode', 'draft'); } catch {}
    });
    await page.route('**/api/users/me', (route) => route.fulfill(json({ id: 'u1', email: 'user@example.com', first_name: 'Test', is_admin: true, role: 'admin' })));
    await page.route('**/api/admin/settings', (route) => route.fulfill(json({ test_mode: true })));
    await page.route('**/api/users/me/capabilities', (route) => route.fulfill(json({ has_elevenlabs: false, has_google_tts: false, has_any_sfx_triggers: false })));
    await page.route('**/api/billing/usage', (route) => route.fulfill(json({ processing_minutes_used_this_month: 0, max_processing_minutes_month: 1000 })));
    await page.route('**/api/users/me/stats', (route) => route.fulfill(json({ episodes_last_30d: 0, upcoming_scheduled: 0 })));
    await page.route('**/api/notifications/**', (route) => route.fulfill(json([])));
    await page.route('**/api/recurring/schedules', (route) => {
      if (route.request().method() === 'GET') return route.fulfill(json([]));
      return route.fulfill(json({ ok: true }));
    });
    await page.route('**/api/media/', (route) => route.fulfill(json([])));
  });

  test('OnboardingWizard has no serious/critical violations and reasonable focus order', async ({ page }) => {
    // Force onboarding via query param and zero podcasts
    await page.route('**/api/podcasts/', (route) => route.fulfill(json([])));
    await page.goto('/?onboarding=1');
    // Expect the branch selection screen
    await expect(page.getByRole('heading', { name: /Welcome! Let's get your podcast set up\./i })).toBeVisible();

    // Primary CTA buttons have visible text (not icon-only)
    const branchCtas = [
      page.getByRole('button', { name: /starting from scratch/i }),
      page.getByRole('button', { name: /bring it over/i })
    ];
    for (const btn of branchCtas) {
      const txt = (await btn.innerText()).trim();
      expect(txt.length).toBeGreaterThanOrEqual(3);
    }
    // Body paragraph font-size >=16px (if present)
    const bodyPara = page.locator('main p').first();
    if (await bodyPara.isVisible()) {
      await expectMinFont(16, bodyPara);
    }
  // A11y scan (scope to main content)
  await runAxe(page, { include: ['main'] });
  // Focus order: choose buttons should be reachable by tab in order
  const newBtn = page.getByRole('button', { name: /starting from scratch/i });
  const importBtn = page.getByRole('button', { name: /bring it over/i });
  await assertTabFocusOrder(page, [newBtn, importBtn]);

  // Focus ring visible when focusing a CTA
  await newBtn.focus();
  const focusVis = await newBtn.evaluate(el => {
    const cs = getComputedStyle(el as HTMLElement);
    return !!((cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px') || (cs.boxShadow && cs.boxShadow !== 'none'));
  });
  expect(focusVis).toBeTruthy();
  });

  test('Episode Creator Step 5: no serious/critical violations, focus order, main actions min font', async ({ page }) => {
    await page.route('**/api/podcasts/', (route) => route.fulfill(json([{ id: 'pod1', title: 'My Show' }])));
    // Provide a simple template
    const tpl = { id: 'tpl1', name: 'Tpl One', podcast_id: 'pod1', ai_settings: { auto_fill_ai: true, auto_generate_tags: true }, segments: [{ id: 'seg-content', segment_type: 'content', source: { source_type: 'content' } }] };
    await page.route('**/api/templates/', (route) => route.fulfill(json([tpl])));
  await page.route('**/api/templates/tpl1', (route) => route.fulfill(json(tpl)));
    await page.route('**/api/episodes/last/numbering', (route) => route.fulfill(json({ season_number: 1, episode_number: 1 })));
  // Keep transcript not ready initially to show guidance text
  await page.route('**/api/ai/transcript-ready**', (route) => route.fulfill(json({ ready: false, eta_seconds: 60 })));
  // Upload and flubber stubs to enable step transitions
  await page.route('**/api/media/upload/main_content', (route) => route.fulfill(json([{ filename: 'in.wav', friendly_name: 'in.wav' }])));
  await page.route('**/api/flubber/prepare-by-file', (route) => route.fulfill(json({ contexts: [] })));

  await page.goto('/');
    await page.getByRole('button', { name: /New Episode/i }).click();
    // Skip to Step 5 quickly: proceed through steps minimally
    // Step 2: choose file
    const chooseBtn = page.getByRole('button', { name: /Choose Audio File/i });
    const fileChooserPromise = page.waitForEvent('filechooser');
    await chooseBtn.click();
    const fc = await fileChooserPromise;
    await fc.setFiles({ name: 'in.wav', mimeType: 'audio/wav', buffer: Buffer.from([82,73,70,70,0,0,0,0,87,65,86,69]) });
    // Intent continue if present
    const continueBtn = page.getByRole('button', { name: /^Continue$/i });
    if (await continueBtn.isVisible()) await continueBtn.click();
    // Step 3 → Step 4
  await page.getByRole('button', { name: /Continue to Details/i }).click();
    const skipBtn = page.getByRole('button', { name: /^Skip$/i });
    if (await skipBtn.isVisible()) await skipBtn.click();

    // Now Step 5 visible
    await expect(page.getByText(/Details & Schedule|Details & Review/i)).toBeVisible();
  await runAxe(page, { include: ['main'] });

    // Focus order: Title input → AI Suggest Title → AI Suggest Description → Assemble button
    const titleInput = page.getByLabel(/Episode Title/i);
    const aiTitle = page.getByRole('button', { name: /AI Suggest Title/i });
    const aiDesc = page.getByRole('button', { name: /AI Suggest Description/i });
    const assemble = page.getByRole('button', { name: /Assemble & Review/i });
    await assertTabFocusOrder(page, [
      titleInput,
      aiTitle,
      aiDesc,
      assemble,
    ]);

    // Primary CTAs have text
    for (const btn of [assemble]) {
      const txt = (await btn.innerText()).trim();
      expect(txt.length).toBeGreaterThanOrEqual(3);
    }

    // Body text min font size (pick first paragraph)
    const stepBody = page.locator('main p').first();
    if (await stepBody.isVisible()) {
      await expectMinFont(16, stepBody);
    }

    // Guidance plain-language text visible
    await expect(page.getByText(/waiting for (your )?transcript/i)).toBeVisible();

    // Focus ring visible on title input
    await titleInput.focus();
    const ringVisible = await titleInput.evaluate(el => {
      const cs = getComputedStyle(el as HTMLElement);
      return !!((cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px') || (cs.boxShadow && cs.boxShadow !== 'none'));
    });
    expect(ringVisible).toBeTruthy();

    // Font sizes: primary actions should be >= 14px
    await expectMinFont(14, aiTitle);
    await expectMinFont(14, assemble);
  });

  test('Admin Dashboard: no serious/critical violations; focus and font checks for key actions', async ({ page }) => {
    // Make sure app decides we have podcasts and are admin
    await page.route('**/api/podcasts/', (route) => route.fulfill(json([{ id: 'pod1', title: 'My Show' }])));
    await page.route('**/api/admin/summary', (route) => route.fulfill(json({ users: 3, podcasts: 1, templates: 1, episodes: 2, published_episodes: 1 })));
    await page.route('**/api/admin/users/full', (route) => route.fulfill(json([{ id: '1', email: 'a@example.com', is_active: true, tier: 'pro' }])))
    await page.route('**/api/admin/metrics', (route) => route.fulfill(json({ daily_active_users_30d: [], daily_signups_30d: [] })));

  await page.goto('/');
    // As admin, we expect AdminDashboard rendered automatically if backend allows. If not, this test would need a nav, but our App does preflight.
    await expect(page.getByText(/Admin Panel/i)).toBeVisible();
  await runAxe(page, { include: ['main'] });

    // Focus order: sidebar first button → Users tab → Settings tab
    const firstNav = page.getByRole('button', { name: /Dashboard Overview|Users/i }).first();
    const usersTab = page.getByRole('button', { name: /^Users$/i });
    const settingsTab = page.getByRole('button', { name: /^Settings$/i });
    await assertTabFocusOrder(page, [
      firstNav,
      usersTab,
      settingsTab,
    ]);

    // Font sizes for prominent actions (e.g., Reset Database in DevTools would be elsewhere; here ensure tabs/buttons >= 14px)
    await expectMinFont(14, usersTab);
    await expectMinFont(14, settingsTab);
  });
});

// Utility injected in page.evaluate contexts: build a unique-ish selector for current element
async function getUniqueSelector(el: Element): Promise<string> {
  // Try id first
  const id = (el as HTMLElement).id;
  if (id) return `#${CSS.escape(id)}`;
  // Build path using classes and tag
  const tag = el.tagName.toLowerCase();
  const cls = (el as HTMLElement).className?.toString().trim();
  if (cls) {
    const firstClass = cls.split(/\s+/)[0];
    return `${tag}.${CSS.escape(firstClass)}`;
  }
  // fallback to tag
  return tag;
}
