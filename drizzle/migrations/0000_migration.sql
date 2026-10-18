create type public.app_role as enum ('super_admin','standard','viewer');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_demo boolean not null default false,
  cooldown_days int not null default 90,
  outreach_paused boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.workspaces to authenticated;
grant all on public.workspaces to service_role;
alter table public.workspaces enable row level security;

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  role public.app_role not null default 'standard',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
grant select, insert, update, delete on public.workspace_members to authenticated;
grant all on public.workspace_members to service_role;
alter table public.workspace_members enable row level security;

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'standard',
  invited_by uuid not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);
grant select, insert, update, delete on public.workspace_invitations to authenticated;
grant all on public.workspace_invitations to service_role;
alter table public.workspace_invitations enable row level security;

create or replace function public.is_member(_ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from workspace_members where workspace_id=_ws and user_id=auth.uid() and active)
$$;
create or replace function public.has_ws_role(_ws uuid, _role public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from workspace_members where workspace_id=_ws and user_id=auth.uid() and role=_role and active)
$$;

create policy "own profile read" on public.profiles for select to authenticated using (
  id = auth.uid() or exists (select 1 from workspace_members a join workspace_members b on a.workspace_id=b.workspace_id where a.user_id=auth.uid() and b.user_id=profiles.id)
);
create policy "own profile update" on public.profiles for update to authenticated using (id=auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id=auth.uid());

create policy "members read ws" on public.workspaces for select to authenticated using (public.is_member(id));
create policy "admins update ws" on public.workspaces for update to authenticated using (public.has_ws_role(id,'super_admin'));
create policy "admins delete ws" on public.workspaces for delete to authenticated using (public.has_ws_role(id,'super_admin'));

create policy "members read members" on public.workspace_members for select to authenticated using (public.is_member(workspace_id));
create policy "admins manage members" on public.workspace_members for all to authenticated using (public.has_ws_role(workspace_id,'super_admin')) with check (public.has_ws_role(workspace_id,'super_admin'));

create policy "admins manage invites" on public.workspace_invitations for all to authenticated using (public.has_ws_role(workspace_id,'super_admin')) with check (public.has_ws_role(workspace_id,'super_admin'));
create policy "invitee reads invite" on public.workspace_invitations for select to authenticated using (lower(email) = lower(auth.jwt()->>'email'));

-- create workspace + become super admin
create or replace function public.create_workspace(_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into workspaces(name, created_by) values (_name, auth.uid()) returning id into _id;
  insert into workspace_members(workspace_id,user_id,role) values (_id, auth.uid(), 'super_admin');
  return _id;
end $$;

-- on signup: profile, accept invitations, else create default workspace
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare _n int; _ws uuid;
begin
  insert into profiles(id, full_name, email) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email);
  insert into workspace_members(workspace_id,user_id,role)
    select workspace_id, new.id, role from workspace_invitations where lower(email)=lower(new.email) and accepted_at is null
    on conflict do nothing;
  get diagnostics _n = row_count;
  update workspace_invitations set accepted_at=now() where lower(email)=lower(new.email) and accepted_at is null;
  if _n = 0 then
    insert into workspaces(name, created_by) values (coalesce(new.raw_user_meta_data->>'workspace_name', 'My workspace'), new.id) returning id into _ws;
    insert into workspace_members(workspace_id,user_id,role) values (_ws, new.id, 'super_admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;