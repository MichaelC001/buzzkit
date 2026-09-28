import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { createClientKey, setupWorkspace, uniq } from '../../../utils/setup';

type WidgetBody = { id: string; environment: string };

const TOKEN = 'cd'.repeat(32);

async function setupClient() {
  const base = await setupWorkspace();
  const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
  return { ...base, clientBearer: { Authorization: `Bearer ${clientKey.secret}` } };
}

describe('/v1/client/widgets', () => {
  it('registers a widget token (201 then 200 on refresh) and removes it', async () => {
    const { clientBearer } = await setupClient();
    const externalId = `user_${uniq()}`;
    const register = () => {
      return api<WidgetBody>('/v1/client/widgets', {
        method: 'POST',
        headers: clientBearer,
        body: JSON.stringify({ externalId, token: TOKEN, environment: 'sandbox' }),
      });
    };

    const created = await register();
    expect(created.status).toBe(201);
    expect(created.body.data?.id).toMatch(/^wgt_/);
    expect(created.body.data?.environment).toBe('sandbox');

    const refreshed = await register();
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data?.id).toBe(created.body.data?.id);

    const removed = await api<WidgetBody & { deleted: boolean }>(
      `/v1/client/widgets/${created.body.data?.id}`,
      {
        method: 'DELETE',
        headers: { ...clientBearer, 'buzzkit-subscriber': externalId },
      }
    );
    expect(removed.status).toBe(200);
    expect(removed.body.data?.deleted).toBe(true);
  });

  it('registers the same token concurrently without conflicting', async () => {
    const { clientBearer } = await setupClient();
    const externalId = `user_${uniq()}`;
    const register = () => {
      return api<WidgetBody>('/v1/client/widgets', {
        method: 'POST',
        headers: clientBearer,
        body: JSON.stringify({ externalId, token: 'ef'.repeat(32) }),
      });
    };

    const results = await Promise.all([register(), register(), register(), register()]);

    expect(results.map((result) => result.status).filter((status) => status >= 400)).toEqual([]);
    expect(new Set(results.map((result) => result.body.data?.id)).size).toBe(1);
  });

  it('moves a token to whoever registers it last', async () => {
    const { clientBearer } = await setupClient();
    const token = '12'.repeat(32);
    const first = await api<WidgetBody>('/v1/client/widgets', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId: `user_${uniq()}`, token }),
    });
    const second = await api<WidgetBody>('/v1/client/widgets', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId: `user_${uniq()}`, token }),
    });

    expect(second.status).toBe(200);
    expect(second.body.data?.id).toBe(first.body.data?.id);
  });

  it('rejects a token that is not hex', async () => {
    const { clientBearer } = await setupClient();
    const response = await api('/v1/client/widgets', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId: `user_${uniq()}`, token: 'z'.repeat(64) }),
    });
    expect(response.status).toBe(400);
  });

  it('answers 404 for a widget that is not the caller’s', async () => {
    const { clientBearer } = await setupClient();
    const owner = `user_${uniq()}`;
    const created = await api<WidgetBody>('/v1/client/widgets', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId: owner, token: '34'.repeat(32) }),
    });

    const response = await api(`/v1/client/widgets/${created.body.data?.id}`, {
      method: 'DELETE',
      headers: { ...clientBearer, 'buzzkit-subscriber': `user_${uniq()}` },
    });
    expect(response.status).toBe(404);
  });
});
