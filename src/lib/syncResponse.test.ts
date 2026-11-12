import { describe, expect, it } from 'vitest';
import { readSyncResponse } from './syncResponse';

describe('readSyncResponse', () => {
  it('explains when a sync endpoint responds with HTML', async () => {
    const response = new Response('<HTML><HEAD></HEAD></HTML>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    });

    await expect(readSyncResponse(response, '/api/sync/pull'))
      .rejects.toThrow('Sync endpoint /api/sync/pull returned HTML (HTTP 404). Check that the deployment serves the sync API routes instead of the app page.');
  });

  it('preserves JSON API errors', async () => {
    const response = new Response(JSON.stringify({ error: 'Authentication required.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(readSyncResponse(response, '/api/sync/push'))
      .rejects.toThrow('Authentication required.');
  });

  it('returns a successful JSON response', async () => {
    const response = new Response(JSON.stringify({ syncedAt: '2026-11-12T00:00:00.000Z' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(readSyncResponse<{ syncedAt: string }>(response, '/api/sync/pull'))
      .resolves.toEqual({ syncedAt: '2026-11-12T00:00:00.000Z' });
  });
});
