create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('apollo','freshsales','slack')),
  status text not null default 'not_connected' check (status in ('not_connected','connected','error')),
  config jsonb not null default '{}'::jsonb,
  last_tested_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);
grant select on public.integrations to authenticated;
grant all on public.integrations to service_role;
alter table public.integrations enable row level security;
create policy "integration read" on public.integrations for select to authenticated using (public.is_member(workspace_id));

create table public.integration_secrets (
  integration_id uuid primary key references public.integrations(id) on delete cascade,
  secret text not null,
  updated_at timestamptz not null default now()
);
grant all on public.integration_secrets to service_role;
alter table public.integration_secrets enable row level security;