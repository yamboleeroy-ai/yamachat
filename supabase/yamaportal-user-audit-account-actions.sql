-- Extend the existing private, service-role-only account audit to cover
-- suspension changes. This is additive; existing password reset rows remain.
alter table public.platform_admin_user_audit
  drop constraint if exists platform_admin_user_audit_action_check;

alter table public.platform_admin_user_audit
  add constraint platform_admin_user_audit_action_check
  check (action in ('password-reset-email', 'account-ban', 'account-unban'));

alter table public.platform_admin_user_audit enable row level security;
revoke all on table public.platform_admin_user_audit from public, anon, authenticated;
grant all on table public.platform_admin_user_audit to service_role;
