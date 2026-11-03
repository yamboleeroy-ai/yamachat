-- Yamachat Windows WNS transport.
-- Microsoft credentials are read by the Edge Function from Supabase Secrets:
-- WNS_TENANT_ID, WNS_CLIENT_ID, WNS_CLIENT_SECRET, WNS_OBJECT_ID.
-- The legacy Vault-backed runtime config remains as a fallback during migration.

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_transport_check,
  drop constraint if exists push_subscriptions_check;

alter table public.push_subscriptions
  add constraint push_subscriptions_transport_check
    check (transport = any (array['webpush'::text,'fcm'::text,'apns'::text,'wns'::text])),
  add constraint push_subscriptions_check
    check (
      (transport='webpush' and endpoint is not null and p256dh is not null and auth is not null)
      or
      (transport=any(array['fcm'::text,'apns'::text]) and token is not null)
      or
      (transport='wns' and endpoint is not null)
    );

create or replace function public.yc_push_runtime_config()
returns jsonb
language sql
stable
security definer
set search_path to 'vault','pg_catalog'
as $function$
  select jsonb_build_object(
    'vapid_public',(select decrypted_secret from vault.decrypted_secrets where name='yamachat_vapid_public' limit 1),
    'vapid_private',(select decrypted_secret from vault.decrypted_secrets where name='yamachat_vapid_private' limit 1),
    'internal_secret',(select decrypted_secret from vault.decrypted_secrets where name='yamachat_push_internal_secret' limit 1),
    'fcm_service_account',(select decrypted_secret from vault.decrypted_secrets where name='yamachat_fcm_service_account' limit 1),
    'wns_tenant_id',(select decrypted_secret from vault.decrypted_secrets where name='yamachat_wns_tenant_id' limit 1),
    'wns_app_id',(select decrypted_secret from vault.decrypted_secrets where name='yamachat_wns_app_id' limit 1),
    'wns_client_secret',(select decrypted_secret from vault.decrypted_secrets where name='yamachat_wns_client_secret' limit 1)
  );
$function$;

revoke all on function public.yc_push_runtime_config() from public, anon, authenticated;
grant execute on function public.yc_push_runtime_config() to service_role;
