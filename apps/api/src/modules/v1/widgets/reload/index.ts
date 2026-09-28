import { ReloadWidgetsSchema, reloadWidgets } from '@buzzkit/api/api/widgets/index';
import { auth } from '@buzzkit/api/libs/auth/index';
import { Response } from '@buzzkit/api/libs/response';
import Elysia from 'elysia';

export const widgetsReload = new Elysia()
  .use(auth)
  .guard({ detail: { tags: ['Widgets'] } })
  .post(
    '/widgets/reload',
    async ({ body, db, tenant }) => {
      const results = await reloadWidgets(db, tenant, body);
      return Response.success({ results }, { ignoreTransform: ['results'] }).send();
    },
    { tenant: 'messages:send', body: ReloadWidgetsSchema }
  );
