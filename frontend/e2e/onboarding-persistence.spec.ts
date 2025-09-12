import { test, expect } from '@playwright/test';

// This test verifies:
// - Comfort toggle (Larger text) persists via useComfortPrefs/localStorage
// - Onboarding current step index persists under ppp.onboarding.step with debounce
// Precondition: App routes '/onboarding' to full-page flow (VITE_ONBOARDING_FULLPAGE=true)

test.describe('Onboarding persistence: comfort + step index', () => {
  test('toggle Larger text, advance, refresh -> state persists', async ({ page }) => {
    await page.addInitScript(() => {
      try { window.localStorage.setItem('authToken', 'e2e-token'); } catch {}
    });

    // Go to onboarding full-page route
    await page.goto('/onboarding');

    // Expect comfort controls to be visible
  const largerTextLabel = page.getByText('Larger text').locator('..');
  await expect(largerTextLabel).toBeVisible();
  // Toggle Larger text on (label wraps the Radix Switch root)
  await largerTextLabel.click();

    // Click Continue to advance one step (button text consistent with wrapper)
    await page.getByRole('button', { name: 'Continue' }).click();

  // Snapshot the announced heading text for the current step (e.g., "Step X of Y: <title>")
    const heading = page.getByRole('status');
    const before = await heading.textContent();

  // Allow debounce (350ms) to persist step index
  await page.waitForTimeout(550);

  // Refresh the page
    await page.reload();

  // Confirm Larger text stayed enabled by inspecting Radix Switch data-state
  const switchState = await page.getByText('Larger text').locator('..').locator('[data-state]').first().getAttribute('data-state');
  expect(switchState).toBe('checked');

    // Confirm we are on the same step by comparing the live heading content
    const after = await page.getByRole('status').textContent();
    expect(after?.trim()).toBe(before?.trim());
  });
});
