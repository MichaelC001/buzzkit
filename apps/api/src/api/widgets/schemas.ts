import { t } from 'elysia';

export const WidgetTokenSchema = t.String({ minLength: 32, maxLength: 512, pattern: '^[0-9a-fA-F]+$' });

export const RegisterWidgetSchema = t.Object({
  token: WidgetTokenSchema,
  environment: t.Optional(t.Union([t.Literal('production'), t.Literal('sandbox')])),
});

export const ReloadWidgetsSchema = t.Object({
  to: t.Union([
    t.String({ minLength: 1, maxLength: 256 }),
    t.Array(t.String({ minLength: 1, maxLength: 256 }), { minItems: 1, maxItems: 100 }),
  ]),
});
