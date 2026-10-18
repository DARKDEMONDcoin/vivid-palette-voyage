
ALTER TABLE public.suppression_list ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Audit log
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read audit" ON public.audit_log FOR SELECT TO authenticated USING (public.has_ws_role(workspace_id, 'super_admin'));
CREATE POLICY "members log own actions" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (public.is_member(workspace_id) AND actor = auth.uid());
CREATE INDEX audit_ws_time ON public.audit_log(workspace_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.audit_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; o jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN r := to_jsonb(OLD); ELSE r := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' THEN o := to_jsonb(OLD); END IF;
  INSERT INTO public.audit_log(workspace_id, actor, action, entity, entity_id, details)
  VALUES ((r->>'workspace_id')::uuid, auth.uid(), lower(TG_OP), TG_TABLE_NAME, (r->>'id')::uuid,
    jsonb_strip_nulls(jsonb_build_object('name', coalesce(r->>'name', r->>'provider', r->>'value', r->>'url'),
      'status', r->>'status', 'old_status', o->>'status', 'role', r->>'role', 'active', r->>'active')));
  RETURN NULL;
END $$;

CREATE TRIGGER audit_agents AFTER INSERT OR UPDATE OR DELETE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_integrations AFTER INSERT OR UPDATE OR DELETE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_organizations AFTER INSERT OR DELETE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_members AFTER INSERT OR UPDATE OR DELETE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_suppression AFTER INSERT OR DELETE ON public.suppression_list FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_campaigns AFTER INSERT OR DELETE OR UPDATE OF status ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_approvals AFTER UPDATE OF status ON public.messages FOR EACH ROW
  WHEN (NEW.status IN ('approved','rejected') AND OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.audit_row();

-- API keys
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read keys" ON public.api_keys FOR SELECT TO authenticated USING (public.has_ws_role(workspace_id, 'super_admin'));
CREATE POLICY "admins create keys" ON public.api_keys FOR INSERT TO authenticated WITH CHECK (public.has_ws_role(workspace_id, 'super_admin') AND created_by = auth.uid());
CREATE POLICY "admins revoke keys" ON public.api_keys FOR UPDATE TO authenticated USING (public.has_ws_role(workspace_id, 'super_admin'));
CREATE TRIGGER audit_api_keys AFTER INSERT OR UPDATE ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.audit_row();

-- Outbound webhooks
CREATE TABLE public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{reply.received,sql.created}',
  secret text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  last_status integer,
  last_error text,
  last_sent_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhooks TO authenticated;
GRANT ALL ON public.webhooks TO service_role;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage webhooks" ON public.webhooks FOR ALL TO authenticated
  USING (public.has_ws_role(workspace_id, 'super_admin')) WITH CHECK (public.has_ws_role(workspace_id, 'super_admin'));
CREATE TRIGGER audit_webhooks AFTER INSERT OR UPDATE OF url, active OR DELETE ON public.webhooks FOR EACH ROW EXECUTE FUNCTION public.audit_row();

-- Notifications
CREATE TABLE public.notification_prefs (
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sql_found boolean NOT NULL DEFAULT true,
  mailbox_error boolean NOT NULL DEFAULT true,
  campaign_finished boolean NOT NULL DEFAULT true,
  approvals_waiting boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, workspace_id)
);
GRANT SELECT, INSERT, UPDATE ON public.notification_prefs TO authenticated;
GRANT ALL ON public.notification_prefs TO service_role;
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs" ON public.notification_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.is_member(workspace_id));

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "mark read" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX notif_user ON public.notifications(user_id, workspace_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.notify_ws(_ws uuid, _kind text, _title text, _link text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications(user_id, workspace_id, kind, title, link)
  SELECT m.user_id, _ws, _kind, _title, _link FROM public.workspace_members m
  LEFT JOIN public.notification_prefs p ON p.user_id = m.user_id AND p.workspace_id = _ws
  WHERE m.workspace_id = _ws AND m.active AND m.role <> 'viewer'
    AND CASE _kind WHEN 'sql_found' THEN coalesce(p.sql_found, true) WHEN 'mailbox_error' THEN coalesce(p.mailbox_error, true)
      WHEN 'campaign_finished' THEN coalesce(p.campaign_finished, true) ELSE true END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_ws(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_events() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'replies' AND NEW.is_sql THEN
    PERFORM public.notify_ws(NEW.workspace_id, 'sql_found', 'New SQL: ' || coalesce(NEW.summary, 'a lead is interested'), '/inbox');
  ELSIF TG_TABLE_NAME = 'campaigns' AND NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    PERFORM public.notify_ws(NEW.workspace_id, 'campaign_finished', 'Campaign finished: ' || NEW.name, '/campaigns/' || NEW.id);
  ELSIF TG_TABLE_NAME = 'agents' AND NEW.mailbox_status = 'error' AND OLD.mailbox_status IS DISTINCT FROM 'error' THEN
    PERFORM public.notify_ws(NEW.workspace_id, 'mailbox_error', 'Mailbox problem on agent ' || NEW.name, '/agents/' || NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER notify_replies AFTER INSERT ON public.replies FOR EACH ROW EXECUTE FUNCTION public.notify_events();
CREATE TRIGGER notify_campaigns AFTER UPDATE OF status ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.notify_events();
CREATE TRIGGER notify_agents AFTER UPDATE OF mailbox_status ON public.agents FOR EACH ROW EXECUTE FUNCTION public.notify_events();
