import type { tables } from '@buzzkit/database';

export type Widget = typeof tables.widget.$inferSelect;

export type WidgetReloadResult = { id: string; ok: boolean; code?: string; reason?: string };
