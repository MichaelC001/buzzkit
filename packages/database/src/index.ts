import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { type ConnectionRetryOptions, withConnectionRetry } from './retry';
import { authTables } from './schema/auth';
import { credentialTables } from './schema/credential';
import { eventTables } from './schema/event';
import { inviteTables } from './schema/invite';
import { apiKeyTables } from './schema/key';
import { liveActivityTables } from './schema/live-activity';
import { messageTables } from './schema/message';
import { secretTables } from './schema/secret';
import { segmentTables } from './schema/segment';
import { sourceTables } from './schema/source';
import { subscriberTables } from './schema/subscriber';
import { tenantTables } from './schema/tenant';
import { topicTables } from './schema/topic';
import { webhookTables } from './schema/webhook';
import { widgetTables } from './schema/widget';
import { workflowTables } from './schema/workflow';
import { workspaceTables } from './schema/workspace';

export const tables = {
  auth: authTables,
  ...workspaceTables,
  ...tenantTables,
  ...apiKeyTables,
  ...inviteTables,
  ...eventTables,
  ...credentialTables,
  ...secretTables,
  ...sourceTables,
  ...liveActivityTables,
  ...widgetTables,
  ...subscriberTables,
  ...topicTables,
  ...messageTables,
  ...webhookTables,
  ...segmentTables,
  ...workflowTables,
};

export type DrizzleOptions = { max?: number; retry?: ConnectionRetryOptions | false };

export type Tables = typeof tables;

export interface Db extends PostgresJsDatabase<Tables> {}

type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface Tx extends Transaction {}

export const createDrizzle = (url: string, options: DrizzleOptions = {}): Db => {
  const client = postgres(url, {
    max: options.max ?? 5,
    connect_timeout: 10,
    fetch_types: false,
    connection: {
      TimeZone: 'UTC',
    },
  });

  const retrying = options.retry === false ? client : withConnectionRetry(client, options.retry ?? {});

  return drizzle(retrying, { schema: tables });
};

export * from 'drizzle-orm';
export { drizzle } from 'drizzle-orm/postgres-js';
export { default as postgres, type Sql } from 'postgres';
export {
  CONNECTION_RETRY_DELAYS_MS,
  type ConnectionRetryOptions,
  isConnectionError,
  retryOnConnectionError,
  withConnectionRetry,
} from './retry';
export { credentialStatus } from './schema/credential';
export { eventActorType } from './schema/event';
export { apiKeyKind } from './schema/key';
export { deliveryAttemptOutcome, deliveryStatus, messageStatus } from './schema/message';
export { channel, environment, provider } from './schema/shared';
export { subscriptionPlatform, subscriptionStatus } from './schema/subscriber';
export { webhookDeliveryStatus, webhookEventSource } from './schema/webhook';
export { workflowStatus } from './schema/workflow';
export { workspaceMemberRole } from './schema/workspace';
