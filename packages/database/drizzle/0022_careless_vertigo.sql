CREATE TABLE "widget" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "widget_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"subscriber_id" bigint NOT NULL,
	"token" text NOT NULL,
	"environment" "environment" DEFAULT 'production' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "widget" ADD CONSTRAINT "widget_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget" ADD CONSTRAINT "widget_subscriber_id_subscriber_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscriber"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "widget_token_unique" ON "widget" USING btree ("tenant_id","token") WHERE "widget"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "widget_subscriber_idx" ON "widget" USING btree ("subscriber_id");