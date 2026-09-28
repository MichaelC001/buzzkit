import { reloadWidgets } from '@buzzkit/api/api/widgets/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
const resolveCredential = vi.fn();
const selectSubscriberByExternalId = vi.fn();

vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@buzzkit/api/providers/index', () => ({
  PROVIDERS: { apns: { send: (input: unknown) => send(input) } },
}));
vi.mock('@buzzkit/api/api/messages/send', () => ({
  resolveCredential: (...args: unknown[]) => resolveCredential(...args),
}));
vi.mock('@buzzkit/api/api/subscribers/index', () => ({
  selectSubscriberByExternalId: (...args: unknown[]) => selectSubscriberByExternalId(...args),
}));

const widget = (id: number, environment: 'production' | 'sandbox' = 'production') => ({
  id,
  tenantId: 1,
  subscriberId: 7,
  token: `${id}`.repeat(64).slice(0, 64),
  environment,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
});

const credential = {
  id: 3,
  updatedAt: new Date(1000),
  secret: 'p8',
  details: { teamId: 'T', keyId: 'K', bundleId: 'com.example.app' },
  environment: 'production',
};

function fakeDb(rows: ReturnType<typeof widget>[]) {
  const deleted: unknown[] = [];
  const db = {
    select: () => ({ from: () => ({ where: async () => rows }) }),
    update: () => ({ set: (values: unknown) => ({ where: async () => deleted.push(values) }) }),
  };
  return { db: db as never, deleted };
}

const tenant = { id: 1 } as never;

beforeEach(() => {
  send.mockReset();
  resolveCredential.mockReset();
  selectSubscriberByExternalId.mockReset();
  selectSubscriberByExternalId.mockResolvedValue({ id: 7 });
  resolveCredential.mockResolvedValue(credential);
});

describe('reloadWidgets', () => {
  it('sends a widgets push to every registration of the subscribers', async () => {
    send.mockResolvedValue({ ok: true });
    const { db } = fakeDb([widget(1), widget(2)]);

    const results = await reloadWidgets(db, tenant, { to: 'user_1' });

    expect(results.map((result) => result.ok)).toEqual([true, true]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![0]).toMatchObject({
      payload: { widgets: true },
      credentialId: 3,
      expiresAt: null,
    });
  });

  it('removes a registration APNs reports as invalid and keeps the others', async () => {
    send.mockResolvedValueOnce({ ok: false, code: 'invalid_endpoint', reason: 'BadDeviceToken' });
    send.mockResolvedValueOnce({ ok: true });
    const { db, deleted } = fakeDb([widget(1), widget(2)]);

    const results = await reloadWidgets(db, tenant, { to: ['user_1'] });

    expect(results.filter((result) => !result.ok)).toEqual([
      expect.objectContaining({ code: 'invalid_endpoint', reason: 'BadDeviceToken' }),
    ]);
    expect(deleted).toHaveLength(1);
  });

  it('reports a missing credential per registration without sending', async () => {
    resolveCredential.mockResolvedValue(null);
    const { db } = fakeDb([widget(1, 'sandbox')]);

    const results = await reloadWidgets(db, tenant, { to: 'user_1' });

    expect(results).toEqual([expect.objectContaining({ ok: false, code: 'no_credential' })]);
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps a registration that failed for any other reason', async () => {
    send.mockResolvedValue({ ok: false, code: 'rate_limited', reason: 'TooManyRequests' });
    const { db, deleted } = fakeDb([widget(1)]);

    await reloadWidgets(db, tenant, { to: 'user_1' });

    expect(deleted).toHaveLength(0);
  });

  it('answers nothing when no subscriber matches', async () => {
    selectSubscriberByExternalId.mockResolvedValue(null);
    const { db } = fakeDb([widget(1)]);

    expect(await reloadWidgets(db, tenant, { to: ['nobody', 'nobody'] })).toEqual([]);
    expect(selectSubscriberByExternalId).toHaveBeenCalledTimes(1);
  });
});
