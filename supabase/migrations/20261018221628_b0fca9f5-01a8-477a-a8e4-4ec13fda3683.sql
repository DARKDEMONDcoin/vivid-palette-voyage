ALTER TABLE public.campaign_steps ADD COLUMN IF NOT EXISTS linkedin_action text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS linkedin_action text;

CREATE TABLE public.linkedin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  message_id uuid,
  action text NOT NULL CHECK (action IN ('connect','visit','message','like','comment','share')),
  content text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','launched','failed')),
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.linkedin_actions TO authenticated;
GRANT ALL ON public.linkedin_actions TO service_role;
ALTER TABLE public.linkedin_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view LinkedIn actions" ON public.linkedin_actions FOR SELECT TO authenticated USING (public.is_member(workspace_id));
CREATE INDEX linkedin_actions_lead_idx ON public.linkedin_actions (lead_id, created_at DESC);