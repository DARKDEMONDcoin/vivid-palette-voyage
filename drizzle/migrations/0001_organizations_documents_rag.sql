create extension if not exists vector;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  logo_path text,
  website text,
  industry text,
  description text,
  languages text[] not null default '{}',
  signature text,
  summary jsonb,
  summary_status text not null default 'none', -- none | draft | approved
  summary_approved_at timestamptz,
  summary_approved_by uuid,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.organizations to authenticated;
grant all on public.organizations to service_role;
alter table public.organizations enable row level security;

create table public.organization_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  granted_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
grant select, insert, delete on public.organization_access to authenticated;
grant all on public.organization_access to service_role;
alter table public.organization_access enable row level security;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  doc_type text not null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  status text not null default 'uploaded', -- uploaded | parsing | indexed | failed
  error text,
  chunk_count int not null default 0,
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  indexed_at timestamptz
);
grant select, insert, update, delete on public.documents to authenticated;
grant all on public.documents to service_role;
alter table public.documents enable row level security;

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  doc_type text not null,
  chunk_index int not null,
  content text not null,
  embedding vector(3072) not null,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.document_chunks to authenticated;
grant all on public.document_chunks to service_role;
alter table public.document_chunks enable row level security;
create index document_chunks_org_idx on public.document_chunks(organization_id);
create index document_chunks_embedding_idx on public.document_chunks using hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

create or replace function public.can_access_org(_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organizations o
    where o.id = _org and (
      has_ws_role(o.workspace_id, 'super_admin')
      or (is_member(o.workspace_id) and (o.created_by = auth.uid()
          or exists (select 1 from organization_access a where a.organization_id = o.id and a.user_id = auth.uid())))
    )
  )
$$;
create or replace function public.can_edit_org(_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organizations o
    where o.id = _org and public.can_access_org(_org)
      and not has_ws_role(o.workspace_id, 'viewer')
  )
$$;

create policy "org read" on public.organizations for select to authenticated using (public.can_access_org(id));
create policy "org insert" on public.organizations for insert to authenticated
  with check (public.is_member(workspace_id) and not public.has_ws_role(workspace_id,'viewer') and created_by = auth.uid());
create policy "org update" on public.organizations for update to authenticated using (public.can_edit_org(id));
create policy "org delete" on public.organizations for delete to authenticated
  using (public.has_ws_role(workspace_id,'super_admin') or created_by = auth.uid());

create policy "access read" on public.organization_access for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from organizations o where o.id = organization_id and public.has_ws_role(o.workspace_id,'super_admin')));
create policy "access admin write" on public.organization_access for insert to authenticated
  with check (exists (select 1 from organizations o where o.id = organization_id and public.has_ws_role(o.workspace_id,'super_admin')));
create policy "access admin delete" on public.organization_access for delete to authenticated
  using (exists (select 1 from organizations o where o.id = organization_id and public.has_ws_role(o.workspace_id,'super_admin')));

create policy "doc read" on public.documents for select to authenticated using (public.can_access_org(organization_id));
create policy "doc insert" on public.documents for insert to authenticated with check (public.can_edit_org(organization_id) and uploaded_by = auth.uid());
create policy "doc update" on public.documents for update to authenticated using (public.can_edit_org(organization_id));
create policy "doc delete" on public.documents for delete to authenticated using (public.can_edit_org(organization_id));

create policy "chunk read" on public.document_chunks for select to authenticated using (public.can_access_org(organization_id));
create policy "chunk insert" on public.document_chunks for insert to authenticated with check (public.can_edit_org(organization_id));
create policy "chunk delete" on public.document_chunks for delete to authenticated using (public.can_edit_org(organization_id));

create or replace function public.match_org_chunks(_org uuid, query_embedding vector(3072), match_count int default 8)
returns table (id uuid, document_id uuid, doc_type text, content text, similarity float)
language sql stable security invoker set search_path = public as $$
  select c.id, c.document_id, c.doc_type, c.content,
    1 - (c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) as similarity
  from document_chunks c
  where c.organization_id = _org
  order by c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  limit match_count;
$$;