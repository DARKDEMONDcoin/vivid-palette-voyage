CREATE TABLE public.app_user_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL, connector_id text NOT NULL CHECK (connector_id IN ('google_mail','microsoft_outlook')),
 connection_key_ciphertext text NOT NULL, email text NOT NULL, reconnect_required boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (workspace_id,user_id,connector_id)
);
GRANT ALL ON public.app_user_connections TO service_role;
REVOKE ALL ON public.app_user_connections FROM anon, authenticated;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.agent_mailboxes (
 agent_id uuid PRIMARY KEY REFERENCES public.agents(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 connection_id uuid NOT NULL REFERENCES public.app_user_connections(id) ON DELETE CASCADE
);
GRANT ALL ON public.agent_mailboxes TO service_role;
REVOKE ALL ON public.agent_mailboxes FROM anon, authenticated;
ALTER TABLE public.agent_mailboxes ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.mailbox_oauth_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL, agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
 connector_id text NOT NULL CHECK (connector_id IN ('google_mail','microsoft_outlook')),
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);
GRANT ALL ON public.mailbox_oauth_attempts TO service_role;
REVOKE ALL ON public.mailbox_oauth_attempts FROM anon, authenticated;
ALTER TABLE public.mailbox_oauth_attempts ENABLE ROW LEVEL SECURITY;