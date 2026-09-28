import type { Transport } from '../core/transport';

export type ReloadWidgetsParams = {
  to: string | string[];
};

export type WidgetReloadResult = {
  id: string;
  ok: boolean;
  code?: string;
  reason?: string;
};

export function widgetsResource(transport: Transport) {
  return {
    reload(params: ReloadWidgetsParams): Promise<{ results: WidgetReloadResult[] }> {
      return transport.request({ method: 'POST', path: '/v1/widgets/reload', body: params });
    },
  };
}

export type WidgetsResource = ReturnType<typeof widgetsResource>;
