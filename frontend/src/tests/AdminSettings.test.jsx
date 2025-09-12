import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminFeatureToggles from '@/components/admin/AdminFeatureToggles.jsx';
import { server } from './testServer';
import { http, HttpResponse } from 'msw';
import { Toaster } from '@/components/ui/toaster.jsx';

const token = 'test-token';

function renderToggles(props = {}) {
  return render(
    <>
      <AdminFeatureToggles token={token} initial={{ test_mode: false }} {...props} />
      <Toaster />
    </>
  );
}

describe('AdminSettings toggles', () => {
  beforeEach(() => {
    // Default GET returns test_mode=false
    server.use(
      http.get('/api/admin/settings', () => HttpResponse.json({ test_mode: false }))
    );
  });

  it('renders each toggle with a visible label', async () => {
    renderToggles();
    // Label text from component
    const label = await screen.findByText(/Test Mode \(Admin\)/i);
    expect(label).toBeVisible();
    // Ensure the switch is in the document and accessible via role
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toBeInTheDocument();
  });

  it('toggling calls /api/admin/settings with correct payload', async () => {
    let lastBody = null;
    server.use(
      http.put('/api/admin/settings', async ({ request }) => {
        const body = await request.json();
        lastBody = body;
        return HttpResponse.json({ ...body });
      })
    );
    renderToggles();

    const sw = await screen.findByRole('switch');
    // Start unchecked (false), click to enable
  fireEvent.click(sw);

    await waitFor(() => {
      expect(lastBody).toEqual({ test_mode: true });
    });
  });

  it('on 500, shows user-safe toast and reverts toggle state', async () => {
    // Start with true so we can click to turn it off and then revert
    server.use(
      http.put('/api/admin/settings', () => HttpResponse.json({ message: 'boom' }, { status: 500 }))
    );

    renderToggles({ initial: { test_mode: true } });

    const sw = await screen.findByRole('switch');
    // Ensure initially checked
    expect(sw).toHaveAttribute('data-state', 'checked');

    // Click to attempt to turn off -> server 500 -> component should show toast and revert
  fireEvent.click(sw);

    // Toast title from component on error
    await screen.findByText(/Failed to update admin settings/i);

    // Reverted to checked
    await waitFor(() => {
      expect(sw).toHaveAttribute('data-state', 'checked');
    });
  });
});
