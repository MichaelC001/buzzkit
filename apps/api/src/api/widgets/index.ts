import { resolveCredential } from '@buzzkit/api/api/messages/send';
import { type Subscriber, selectSubscriberByExternalId } from '@buzzkit/api/api/subscribers/index';
import type { Tenant } from '@buzzkit/api/api/tenants/index';
import { NotFoundError } from '@buzzkit/api/libs/error';
import { log } from '@buzzkit/api/libs/logger';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { PROVIDERS } from '@buzzkit/api/providers/index';
import { runConcurrently } from '@buzzkit/api/utils/concurrency';
import { and, type Db, eq, inArray, isNull, sql, tables } from '@buzzkit/database';
import type { RegisterWidgetSchema, ReloadWidgetsSchema } from './schemas';
import type { Widget, WidgetReloadResult } from './types';

export * from './schemas';
export * from './serialize';
export type * from './types';

const RELOAD_CONCURRENCY = 8;

export async function registerWidget(
  db: Db,
  tenantId: number,
  subscriber: Subscriber,
  input: typeof RegisterWidgetSchema.static
): Promise<{ widget: Widget; created: boolean }> {
  const token = input.token.toLowerCase();
  const environment = input.environment ?? 'production';

  return await trace(
    'widgets.register',
    { 'tenant.id': tenantId, 'subscriber.id': subscriber.id },
    async (span) => {
      const [existing] = await db
        .select()
        .from(tables.widget)
        .where(
          and(
            eq(tables.widget.tenantId, tenantId),
            eq(tables.widget.token, token),
            isNull(tables.widget.deletedAt)
          )
        );

      if (existing) {
        const [updated] = await db
          .update(tables.widget)
          .set({ subscriberId: subscriber.id, environment, updatedAt: new Date() })
          .where(eq(tables.widget.id, existing.id))
          .returning();
        span.set('widget.created', false);
        return { widget: updated as Widget, created: false };
      }

      const [created] = await db
        .insert(tables.widget)
        .values({ tenantId, subscriberId: subscriber.id, token, environment })
        .onConflictDoUpdate({
          target: [tables.widget.tenantId, tables.widget.token],
          targetWhere: sql`deleted_at is null`,
          set: { subscriberId: subscriber.id, environment, updatedAt: new Date() },
        })
        .returning();
      span.set('widget.created', true);
      return { widget: created as Widget, created: true };
    }
  );
}

export async function softDeleteWidgetByClient(
  db: Db,
  tenantId: number,
  subscriberId: number,
  widgetSqid: string
): Promise<Widget> {
  const widgetId = decodeEntityId('widget', widgetSqid);
  if (!widgetId) throw new NotFoundError('Widget not found');

  return await trace(
    'widgets.softDelete',
    { 'tenant.id': tenantId, 'subscriber.id': subscriberId },
    async () => {
      const [deleted] = await db
        .update(tables.widget)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(tables.widget.id, widgetId),
            eq(tables.widget.tenantId, tenantId),
            eq(tables.widget.subscriberId, subscriberId),
            isNull(tables.widget.deletedAt)
          )
        )
        .returning();
      if (!deleted) throw new NotFoundError('Widget not found');
      return deleted as Widget;
    }
  );
}

async function listReloadTargets(db: Db, tenantId: number, externalIds: string[]): Promise<Widget[]> {
  const subscriberIds: number[] = [];
  for (const externalId of externalIds) {
    const subscriber = await selectSubscriberByExternalId(db, tenantId, externalId);
    if (subscriber) subscriberIds.push(subscriber.id);
  }
  if (subscriberIds.length === 0) return [];

  return await db
    .select()
    .from(tables.widget)
    .where(
      and(
        eq(tables.widget.tenantId, tenantId),
        inArray(tables.widget.subscriberId, subscriberIds),
        isNull(tables.widget.deletedAt)
      )
    );
}

export async function reloadWidgets(
  db: Db,
  tenant: Tenant,
  input: typeof ReloadWidgetsSchema.static
): Promise<WidgetReloadResult[]> {
  const externalIds = [...new Set(Array.isArray(input.to) ? input.to : [input.to])];

  return await trace('widgets.reload', { 'tenant.id': tenant.id }, async (outer) => {
    const rows = await listReloadTargets(db, tenant.id, externalIds);
    const results: WidgetReloadResult[] = [];

    await runConcurrently(rows, RELOAD_CONCURRENCY, async (row) => {
      results.push(await reloadWidget(db, tenant, row));
    });

    outer.set('widgets.targets', rows.length);
    outer.set('widgets.sent', results.filter((entry) => entry.ok).length);
    outer.set('widgets.failed', results.filter((entry) => !entry.ok).length);
    return results;
  });
}

async function reloadWidget(db: Db, tenant: Tenant, row: Widget): Promise<WidgetReloadResult> {
  const id = encodeId('widget', row.id);
  const credential = await resolveCredential(db, tenant.id, 'apns', row.environment);
  if (!credential) {
    return {
      id,
      ok: false,
      code: 'no_credential',
      reason: `No ${row.environment} APNs credential configured`,
    };
  }

  const result = await trace(
    'deliveries.send',
    { 'delivery.provider': 'apns', 'tenant.id': tenant.id, 'widget.id': row.id },
    async (span) => {
      const sent = await PROVIDERS.apns.send({
        credentialId: credential.id,
        credentialUpdatedAt: credential.updatedAt.getTime(),
        secret: credential.secret,
        details: credential.details,
        environment: credential.environment,
        endpoint: row.token,
        payload: { widgets: true },
        expiresAt: null,
      });
      span.set('delivery.ok', sent.ok);
      if (!sent.ok) span.set('delivery.code', sent.code);
      return sent;
    }
  );

  if (!result.ok) {
    log.warn('[Deliveries] Widget reload failed', {
      tenantId: tenant.id,
      subscriberId: row.subscriberId,
      widgetId: row.id,
      code: result.code,
      reason: result.reason,
    });
  }
  if (!result.ok && result.code === 'invalid_endpoint') {
    await db.update(tables.widget).set({ deletedAt: new Date() }).where(eq(tables.widget.id, row.id));
  }

  return { id, ok: result.ok, ...(result.ok ? {} : { code: result.code, reason: result.reason }) };
}
