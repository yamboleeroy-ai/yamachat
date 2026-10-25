-- Audit metadata-only owner actions on Yamachat's Supabase Storage.
-- File contents are never copied into this table or exposed by the admin API.
create table if not exists public.platform_admin_storage_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('delete-object')),
  bucket_id text not null,
  object_path text not null,
  object_size bigint not null default 0 check (object_size >= 0),
  outcome text not null check (outcome in ('started','succeeded','failed')),
  created_at timestamptz not null default now()
);

alter table public.platform_admin_storage_audit enable row level security;
revoke all on table public.platform_admin_storage_audit from public, anon, authenticated;
grant all on table public.platform_admin_storage_audit to service_role;
