import { encodeId } from '@buzzkit/api/libs/sqids';
import type { Widget } from './types';

export function serializeWidget(widget: Widget) {
  return {
    id: encodeId('widget', widget.id),
    environment: widget.environment,
    createdAt: widget.createdAt,
    updatedAt: widget.updatedAt,
  };
}
