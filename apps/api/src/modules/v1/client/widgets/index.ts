import {
  ClientIdentitySchema,
  findSubscriberByExternalId,
  resolveSystemAttributes,
  upsertSubscriber,
} from '@buzzkit/api/api/subscribers/index';
import {
  RegisterWidgetSchema,
  registerWidget,
  serializeWidget,
  softDeleteWidgetByClient,
} from '@buzzkit/api/api/widgets/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { verifyClientIdentity, verifyIdentity } from '@buzzkit/api/libs/identity';
import { markDeleted, Response } from '@buzzkit/api/libs/response';
import Elysia, { t } from 'elysia';

export const clientWidgets = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Client'] } })
  .post(
    '/client/widgets',
    async ({ body, db, request, set, tenant }) => {
      const verified = await verifyIdentity(tenant, body.externalId, body.identityHash);

      const { subscriber } = await upsertSubscriber(db, tenant.id, body.externalId, {
        verifiedNow: verified,
        systemAttributes: resolveSystemAttributes(request),
      });

      const { widget, created } = await registerWidget(db, tenant.id, subscriber, body);

      return Response.success(serializeWidget(widget), { entity: 'widget' })
        .status(created ? 201 : 200)
        .send(set);
    },
    {
      client: true,
      body: t.Composite([ClientIdentitySchema, RegisterWidgetSchema]),
    }
  )
  .delete(
    '/client/widgets/:id',
    async ({ db, headers, params, tenant }) => {
      const externalId = await verifyClientIdentity(tenant, headers);
      const subscriber = await findSubscriberByExternalId(db, tenant.id, externalId);

      const widget = await softDeleteWidgetByClient(db, tenant.id, subscriber.id, params.id);

      return Response.success(markDeleted(serializeWidget(widget)), { entity: 'widget' }).send();
    },
    { client: true }
  );
