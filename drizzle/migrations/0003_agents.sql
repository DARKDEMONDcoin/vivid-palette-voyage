create table public.agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  avatar_path text,
  bio text,
  tone text not null default 'professional',
  signature text,
  status text not null default 'paused', -- active | paused
  target_markets text[] not null default '{}',
  icp_industries text[] not null default '{}',
  icp_company_sizes text[] not null default '{}',
  icp_titles text[] not null default '{}',
  icp_seniorities text[] not null default '{}',
  mailbox_provider text, -- gmail | outlook
  mailbox_email text,
  mailbox_status text not null default 'not_connected', -- not_connected | connected | error
  mailbox_last_tested_at timestamptz,
  daily_send_cap int not null default 40,
  send_days int[] not null default '{1,2,3,4,5}',
  send_start_hour int not null default 9,
  send_end_hour int not null default 17,
  send_timezone text not null default 'Asia/Dubai',
  min_delay_seconds int not null default 120,
  warmup_enabled boolean not null default true,
  warmup_start_cap int not null default 10,
  warmup_increment int not null default 5,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.agents to authenticated;
grant all on public.agents to service_role;
alter table public.agents enable row level security;

create or replace function public.validate_agent() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.tone not in ('professional','consultative','friendly','concise') then raise exception 'invalid tone'; end if;
  if new.status not in ('active','paused') then raise exception 'invalid status'; end if;
  if new.send_start_hour < 0 or new.send_end_hour > 24 or new.send_start_hour >= new.send_end_hour then raise exception 'invalid sending window'; end if;
  if new.daily_send_cap < 1 or new.min_delay_seconds < 0 then raise exception 'invalid send limits'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger agents_validate before insert or update on public.agents for each row execute function public.validate_agent();

create policy "agent read" on public.agents for select to authenticated using (
  public.has_ws_role(workspace_id,'super_admin') or public.has_ws_role(workspace_id,'viewer')
  or (public.is_member(workspace_id) and created_by = auth.uid())
);
create policy "agent insert" on public.agents for insert to authenticated with check (
  public.is_member(workspace_id) and not public.has_ws_role(workspace_id,'viewer')
  and created_by = auth.uid() and public.can_access_org(organization_id)
);
create policy "agent update" on public.agents for update to authenticated using (
  public.has_ws_role(workspace_id,'super_admin') or (public.is_member(workspace_id) and not public.has_ws_role(workspace_id,'viewer') and created_by = auth.uid())
) with check (public.can_access_org(organization_id));
create policy "agent delete" on public.agents for delete to authenticated using (
  public.has_ws_role(workspace_id,'super_admin') or (public.is_member(workspace_id) and created_by = auth.uid())
);