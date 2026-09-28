import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { createClientKey, setupWorkspace, uniq } from '../../../utils/setup';

type ReloadBody = { results: Array<{ id: string; ok: boolean; code?: string }> };

async function setupTenant() {
  const base = await setupWorkspace();
  const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
  return {
    ...base,
    clientBearer: { Authorization: `Bearer ${clientKey.secret}` },
    tenantBearer: { ...base.keyBearer, 'buzzkit-tenant': 'default' },
  };
}

describe('/v1/widgets/reload', () => {
  it('targets every widget of the subscribers and reports a missing credential per widget', async () => {
    const { clientBearer, tenantBearer } = await setupTenant();
    const externalId = `user_${uniq()}`;
    for (const token of ['56'.repeat(32), '78'.repeat(32)]) {
      await api('/v1/client/widgets', {
        method: 'POST',
        headers: clientBearer,
        body: JSON.stringify({ externalId, token }),
      });
    }

    const response = await api<ReloadBody>('/v1/widgets/reload', {
      method: 'POST',
      headers: tenantBearer,
      body: JSON.stringify({ to: [externalId, `user_${uniq()}`] }),
    });

    expect(response.status).toBe(200);
    expect(response.body.data?.results).toHaveLength(2);
    expect(response.body.data?.results.every((result) => !result.ok && result.code === 'no_credential')).toBe(
      true
    );
    expect(response.body.data?.results[0]?.id).toMatch(/^wgt_/);
  });

  it('answers an empty list for a subscriber without widgets', async () => {
    const { tenantBearer } = await setupTenant();
    const response = await api<ReloadBody>('/v1/widgets/reload', {
      method: 'POST',
      headers: tenantBearer,
      body: JSON.stringify({ to: `user_${uniq()}` }),
    });

    expect(response.status).toBe(200);
    expect(response.body.data?.results).toEqual([]);
  });

  it('is refused to a client key', async () => {
    const { clientBearer } = await setupTenant();
    const response = await api('/v1/widgets/reload', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ to: `user_${uniq()}` }),
    });
    expect(response.status).toBeGreaterThanOrEqual(401);
    expect(response.status).toBeLessThan(404);
  });
});
