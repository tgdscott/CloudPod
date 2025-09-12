import { Page, expect, Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export async function runAxe(page: Page, opts?: { include?: string[]; exclude?: string[]; impact?: Array<'serious' | 'critical'> }) {
  const { include, exclude, impact = ['serious', 'critical'] } = opts || {};
  const builder = new AxeBuilder({ page });
  if (include && include.length) {
    for (const s of include) builder.include(s);
  } else {
    // Default to scanning the main landmark or body
    builder.include('main');
    builder.include('body');
  }
  const defaultExcludes = [
    // Radix/Focus guards & overlays often use aria-hidden focus sentinels
    '[data-radix-focus-guard]',
    "span[aria-hidden='true'][tabindex]",
    "[aria-hidden='true'][tabindex]",
    // Toast viewport and its live regions
    "[aria-label='Notifications']",
    "[aria-label='Notifications'] *",
  ];
  const allExcludes = [
    ...defaultExcludes,
    '[role="progressbar"][data-state="indeterminate"]',
    'input[type="time"]',
    'input[type="date"]',
    ...((exclude || [])),
  ];
  for (const s of allExcludes) builder.exclude(s);
  const results = await builder.analyze();
  const bad = results.violations.filter((v) => impact.includes(v.impact as any));
  if (bad.length) {
    // Create a compact summary for debugging
    const summary = bad.map((v) => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.slice(0, 5).map(n => n.html) }));
    // eslint-disable-next-line no-console
    console.error('A11y violations:', JSON.stringify(summary, null, 2));
  }
  expect(bad, 'No serious/critical a11y violations').toEqual([]);
}

export async function assertTabFocusOrder(page: Page, locators: Locator[]) {
  // Ensure nothing is focused initially and start from the main region if present
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur?.(); });
  const main = page.locator('main').first();
  if (await main.count()) {
    try { await main.focus(); } catch {}
  }
  for (let i = 0; i < locators.length; i++) {
    const target = locators[i];
    // Press Tab up to N times until the target gains focus, to allow for minor intermediate tabbables.
    let ok = false;
    for (let steps = 0; steps < 20; steps++) {
      await page.keyboard.press('Tab');
      const focused = await target.evaluate((el) => el === document.activeElement);
      if (focused) { ok = true; break; }
    }
    if (!ok) await expect(target).toBeFocused({ timeout: 1000 });
  }
}

export async function expectMinFont(px: number, locator: Locator) {
  const sz = await locator.evaluate((el) => {
    const s = window.getComputedStyle(el as Element);
    return parseFloat(s.fontSize || '0');
  });
  expect(sz).toBeGreaterThanOrEqual(px);
}
