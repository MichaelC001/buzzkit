# Widgets

WidgetKit push reloads: the backend tells a subscriber's home-screen and Lock Screen widgets that their content changed, and iOS reloads their timelines. The push carries no data; the widget's timeline provider fetches whatever it shows. Tenant-context routes: a tenant key implies its tenant; workspace keys and sessions select one with `buzzkit-tenant`.

## The push

A widget reload is an APNs push with `apns-push-type: widgets`, topic `<bundleId>.push-type.widgets` and the body `{"aps":{"content-changed":true}}` (`providers/apns/request.ts`, `providers/apns/payload.ts`). It goes out on the tenant's existing APNs credential for the registration's environment; there is no separate widget credential. The key must be allowed to send to the app's topics, which a team-scoped key is.

iOS budgets these pushes the way it budgets timeline reloads, so a reload is opportunistic: the device may defer or coalesce it. Use it to say "something changed", never to deliver content or anything time-critical.

## Registration

WidgetKit hands out one push token per device for all of the app's widgets, so a registration is one row per device (`widget`, [data-model.md](../data-model.md)), not one per widget. The device registers it through the client API (`POST /v1/client/widgets`, `DELETE /v1/client/widgets/:id`, [client.md](client.md)); the iOS SDK does it from the widget extension's push handler. The token is stored lower-cased and is unique per tenant among live rows: a token registered again by a different subscriber moves to that subscriber. A subscriber merge moves widget registrations to the surviving subscriber like every other device registration (`api/subscribers/merge.ts`).

## POST /v1/widgets/reload

Scope `messages:send`. `{ to: externalId | externalId[] }` (one to 100 ids) sends a widgets push to every registered widget token of those subscribers. It runs synchronously and records no message and no deliveries, like `POST /v1/live-activities/send`.

The response is `{ results: [{ id: "wgt_…", ok, code?, reason? }] }`, one entry per widget registration pushed to.

- An unknown subscriber is skipped, and a subscriber with no widget registrations contributes nothing, so either can yield an empty `results`.
- A registration whose environment has no APNs credential reports `code: "no_credential"`.
- A result with `code: "invalid_endpoint"` (APNs rejected the token) soft-deletes that registration, so the next reload does not try it again.
- Every other failure carries the shared delivery error `code` and APNs's `reason`.

Each push runs in a `deliveries.send` span with `delivery.ok` and `delivery.code`; the `widgets.reload` span stamps `widgets.targets`, `widgets.sent` and `widgets.failed`.

In the server SDK: `buzzkit.widgets.reload({ to })` returns `{ results: BuzzKit.WidgetReloadResult[] }` (params `BuzzKit.ReloadWidgetsParams`).
