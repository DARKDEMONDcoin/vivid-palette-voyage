CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  name text NOT NULL,
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en','ar','auto')),
  ab_testing boolean NOT NULL DEFAULT false,
  source_type text CHECK (source_type IN ('sheet','file','apollo')),
  source_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  qualification_weights jsonb NOT NULL DEFAULT '{"size":30,"fit":50,"multilingual":20}'::jsonb,
  qualification_threshold integer NOT NULL DEFAULT 5 CHECK (qualification_threshold BETWEEN 1 AND 10),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed','archived')),
  wizard_step integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_campaign(_c uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM campaigns c WHERE c.id = _c AND (
    has_ws_role(c.workspace_id,'super_admin') OR has_ws_role(c.workspace_id,'viewer')
    OR (is_member(c.workspace_id) AND c.created_by = auth.uid())))
$$;
CREATE OR REPLACE FUNCTION public.can_edit_campaign(_c uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM campaigns c WHERE c.id = _c AND (
    has_ws_role(c.workspace_id,'super_admin')
    OR (is_member(c.workspace_id) AND NOT has_ws_role(c.workspace_id,'viewer') AND c.created_by = auth.uid())))
$$;

CREATE POLICY "campaign read" ON public.campaigns FOR SELECT TO authenticated USING (public.can_access_campaign(id));
CREATE POLICY "campaign insert" ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (public.is_member(workspace_id) AND NOT public.has_ws_role(workspace_id,'viewer') AND created_by = auth.uid() AND public.can_access_org(organization_id));
CREATE POLICY "campaign update" ON public.campaigns FOR UPDATE TO authenticated USING (public.can_edit_campaign(id)) WITH CHECK (public.can_access_org(organization_id));
CREATE POLICY "campaign delete" ON public.campaigns FOR DELETE TO authenticated USING (public.can_edit_campaign(id));

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text,
  first_name text, last_name text, title text, seniority text,
  company text, company_domain text, website text, company_size text, industry text,
  country text, city text, language text, linkedin_url text, phone text,
  source text NOT NULL DEFAULT 'file',
  apollo_id text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX leads_ws_email_uq ON public.leads (workspace_id, lower(email)) WHERE email IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.campaign_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  score integer CHECK (score BETWEEN 1 AND 10),
  reasoning text,
  signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','qualified','not_qualified')),
  decision_overridden boolean NOT NULL DEFAULT false,
  qualify_error text,
  research jsonb,
  research_status text NOT NULL DEFAULT 'none' CHECK (research_status IN ('none','done','failed')),
  research_error text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, lead_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_leads TO authenticated;
GRANT ALL ON public.campaign_leads TO service_role;
ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cl read" ON public.campaign_leads FOR SELECT TO authenticated USING (public.can_access_campaign(campaign_id));
CREATE POLICY "cl update" ON public.campaign_leads FOR UPDATE TO authenticated USING (public.can_edit_campaign(campaign_id));
CREATE POLICY "cl delete" ON public.campaign_leads FOR DELETE TO authenticated USING (public.can_edit_campaign(campaign_id));

CREATE POLICY "lead read" ON public.leads FOR SELECT TO authenticated USING (
  public.has_ws_role(workspace_id,'super_admin') OR public.has_ws_role(workspace_id,'viewer')
  OR (public.is_member(workspace_id) AND created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM public.campaign_leads cl JOIN public.campaigns c ON c.id = cl.campaign_id
             WHERE cl.lead_id = leads.id AND c.created_by = auth.uid()));
CREATE POLICY "lead update" ON public.leads FOR UPDATE TO authenticated USING (
  public.has_ws_role(workspace_id,'super_admin') OR (public.is_member(workspace_id) AND created_by = auth.uid()));

CREATE TABLE public.suppression_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  value text NOT NULL,
  kind text NOT NULL DEFAULT 'email' CHECK (kind IN ('email','domain')),
  reason text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX suppression_uq ON public.suppression_list (workspace_id, kind, lower(value));
GRANT SELECT, INSERT, DELETE ON public.suppression_list TO authenticated;
GRANT ALL ON public.suppression_list TO service_role;
ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;
CREATE POLICY "supp read" ON public.suppression_list FOR SELECT TO authenticated USING (public.is_member(workspace_id));
CREATE POLICY "supp insert" ON public.suppression_list FOR INSERT TO authenticated WITH CHECK (public.is_member(workspace_id) AND NOT public.has_ws_role(workspace_id,'viewer'));
CREATE POLICY "supp delete" ON public.suppression_list FOR DELETE TO authenticated USING (public.has_ws_role(workspace_id,'super_admin'));