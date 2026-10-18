CREATE TABLE public.campaign_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','linkedin','call')),
  delay_days integer NOT NULL DEFAULT 0 CHECK (delay_days BETWEEN 0 AND 60),
  instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, step_order)
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  campaign_lead_id uuid NOT NULL REFERENCES public.campaign_leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.campaign_steps(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  channel text NOT NULL,
  variant text NOT NULL DEFAULT 'A' CHECK (variant IN ('A','B')),
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected','scheduled','sent','failed','skipped','waiting')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  error text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_lead_id, step_id)
);
CREATE INDEX messages_due_idx ON public.messages (status, scheduled_for);
CREATE TABLE public.replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  campaign_lead_id uuid NOT NULL REFERENCES public.campaign_leads(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email',
  body text NOT NULL,
  classification text,
  summary text,
  is_sql boolean NOT NULL DEFAULT false,
  freshsales_id text,
  crm_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.campaign_steps, public.messages, public.replies TO authenticated;
GRANT ALL ON public.campaign_steps, public.messages, public.replies TO service_role;
ALTER TABLE public.campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read steps" ON public.campaign_steps FOR SELECT TO authenticated USING (public.can_access_campaign(campaign_id));
CREATE POLICY "read messages" ON public.messages FOR SELECT TO authenticated USING (public.can_access_campaign(campaign_id));
CREATE POLICY "edit messages" ON public.messages FOR UPDATE TO authenticated USING (public.can_edit_campaign(campaign_id)) WITH CHECK (public.can_edit_campaign(campaign_id));
CREATE POLICY "read replies" ON public.replies FOR SELECT TO authenticated USING (public.can_access_campaign(campaign_id));