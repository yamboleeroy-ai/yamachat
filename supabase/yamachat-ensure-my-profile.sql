-- Repair only the signed-in user's missing Yamachat profile, using the same
-- Supabase Auth UUID. Existing profiles and all related chat data are untouched.
create or replace function public.yamachat_ensure_my_profile()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_metadata jsonb := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb);
  v_username text;
  v_display_name text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if exists (select 1 from public.profiles where id = v_user_id) then
    return v_user_id;
  end if;

  -- Use the authenticated UUID, never an email/name lookup, to avoid linking
  -- one person's account or existing profile to another person's identity.
  -- profiles.username has a 32-character limit. Keep the UUID suffix unique
  -- while staying within that existing schema constraint.
  v_username := 'user_' || substr(replace(v_user_id::text, '-', ''), 1, 27);
  v_display_name := left(coalesce(
    nullif(btrim(v_metadata ->> 'display_name'), ''),
    nullif(btrim(v_metadata ->> 'full_name'), ''),
    nullif(btrim(v_metadata ->> 'name'), '')
  ), 80);

  insert into public.profiles (id, username, display_name)
  values (v_user_id, v_username, v_display_name)
  on conflict (id) do nothing;

  return v_user_id;
end;
$function$;

revoke all on function public.yamachat_ensure_my_profile() from public, anon;
grant execute on function public.yamachat_ensure_my_profile() to authenticated;
