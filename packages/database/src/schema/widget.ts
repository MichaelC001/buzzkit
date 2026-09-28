import { sql } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { bigId, bigRef, createdAt, deletedAt, environment, updatedAt } from './shared';
import { subscriber } from './subscriber';
import { tenant } from './tenant';

export const widget = pgTable(
  'widget',
  {
    id: bigId(),
    tenantId: bigRef('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    subscriberId: bigRef('subscriber_id')
      .notNull()
      .references(() => subscriber.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    environment: environment('environment').notNull().default('production'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('widget_token_unique').on(table.tenantId, table.token).where(sql`${table.deletedAt} is null`),
    index('widget_subscriber_idx').on(table.subscriberId),
  ]
);

export const widgetTables = { widget };
