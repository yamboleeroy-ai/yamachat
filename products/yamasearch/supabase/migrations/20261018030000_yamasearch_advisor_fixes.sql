create index if not exists yamasearch_sync_preferences_profile_owner_idx
  on public.yamasearch_sync_preferences (profile_id, user_id);
create index if not exists yamasearch_sync_records_profile_owner_idx
  on public.yamasearch_sync_records (profile_id, user_id);

drop policy if exists yamasearch_accounts_select_own on public.yamasearch_accounts;
create policy yamasearch_accounts_select_own on public.yamasearch_accounts
for select to authenticated
using (user_id = (select auth.uid()) and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));

drop policy if exists yamasearch_accounts_update_own on public.yamasearch_accounts;
create policy yamasearch_accounts_update_own on public.yamasearch_accounts
for update to authenticated
using (user_id = (select auth.uid()) and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false))
with check (user_id = (select auth.uid()) and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));

drop policy if exists yamasearch_profiles_select_own on public.yamasearch_browser_profiles;
create policy yamasearch_profiles_select_own on public.yamasearch_browser_profiles
for select to authenticated
using (user_id = (select auth.uid()) and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));

drop policy if exists yamasearch_preferences_select_own on public.yamasearch_sync_preferences;
create policy yamasearch_preferences_select_own on public.yamasearch_sync_preferences
for select to authenticated
using (user_id = (select auth.uid()) and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));

drop policy if exists yamasearch_devices_select_own on public.yamasearch_devices;
create policy yamasearch_devices_select_own on public.yamasearch_devices
for select to authenticated
using (user_id = (select auth.uid()) and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));

drop policy if exists yamasearch_records_select_own on public.yamasearch_sync_records;
create policy yamasearch_records_select_own on public.yamasearch_sync_records
for select to authenticated
using (user_id = (select auth.uid()) and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));
