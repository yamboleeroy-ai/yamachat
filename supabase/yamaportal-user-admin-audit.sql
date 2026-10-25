-- Minimized audit for sensitive account actions. No passwords, tokens or email
-- addresses are stored here.
create table if not exists public.platform_admin_user_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid not null,
  action text not null check (action in ('password-reset-email')),
  outcome text not null check (outcome in ('started', 'succeeded', 'failed')),
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.platform_admin_user_audit enable row level security;
revoke all on table public.platform_admin_user_audit from public, anon, authenticated;
grant all on table public.platform_admin_user_audit to service_role;
