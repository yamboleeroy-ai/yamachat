-- Dedicated YamaSearch backend only. Never apply from the shared Yamachat Supabase root.
-- Deployment must verify the remote project ref against products/yamasearch/supabase/project-ref.txt.

create extension if not exists pg_cron;

create table if not exists public.yamasearch_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  preferred_provider text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint yamasearch_accounts_display_name_length check (char_length(display_name) <= 80),
  constraint yamasearch_accounts_avatar_https check (
    avatar_url is null or (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://')
  ),
  constraint yamasearch_accounts_provider_length check (preferred_provider is null or char_length(preferred_provider) between 1 and 80)
);

create table if not exists public.yamasearch_browser_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Osobní',
  is_default boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint yamasearch_browser_profiles_name_length check (char_length(name) between 1 and 80),
  constraint yamasearch_browser_profiles_id_owner_unique unique (id, user_id)
);

create unique index if not exists yamasearch_one_default_profile_per_user
  on public.yamasearch_browser_profiles (user_id)
  where is_default;
create index if not exists yamasearch_browser_profiles_owner_idx
  on public.yamasearch_browser_profiles (user_id, updated_at desc);

create table if not exists public.yamasearch_sync_preferences (
  profile_id uuid primary key,
  user_id uuid not null,
  sync_bookmarks boolean not null default false,
  sync_settings boolean not null default false,
  sync_history boolean not null default false,
  sync_open_tabs boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  constraint yamasearch_sync_preferences_profile_owner_fkey
    foreign key (profile_id, user_id)
    references public.yamasearch_browser_profiles (id, user_id)
    on delete cascade
);
create index if not exists yamasearch_sync_preferences_owner_idx
  on public.yamasearch_sync_preferences (user_id);
create index if not exists yamasearch_sync_preferences_profile_owner_idx
  on public.yamasearch_sync_preferences (profile_id, user_id);

create table if not exists public.yamasearch_devices (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid,
  name text not null,
  platform text not null,
  app_version text not null default '',
  created_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  constraint yamasearch_devices_name_length check (char_length(name) between 1 and 100),
  constraint yamasearch_devices_platform check (platform in ('windows', 'android', 'ios-pwa')),
  constraint yamasearch_devices_version_length check (char_length(app_version) <= 40),
  constraint yamasearch_devices_id_owner_unique unique (id, user_id),
  constraint yamasearch_devices_profile_owner_fkey
    foreign key (profile_id, user_id)
    references public.yamasearch_browser_profiles (id, user_id)
    on delete set null (profile_id)
);
create index if not exists yamasearch_devices_owner_seen_idx
  on public.yamasearch_devices (user_id, last_seen_at desc);
create index if not exists yamasearch_devices_profile_owner_idx
  on public.yamasearch_devices (profile_id, user_id);

create table if not exists public.yamasearch_sync_records (
  profile_id uuid not null,
  user_id uuid not null,
  collection text not null,
  record_id text not null,
  schema_version integer not null default 1,
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  device_id uuid,
  primary key (profile_id, collection, record_id),
  constraint yamasearch_sync_records_profile_owner_fkey
    foreign key (profile_id, user_id)
    references public.yamasearch_browser_profiles (id, user_id)
    on delete cascade,
  constraint yamasearch_sync_records_device_owner_fkey
    foreign key (device_id, user_id)
    references public.yamasearch_devices (id, user_id)
    on delete set null (device_id),
  constraint yamasearch_sync_records_collection
    check (collection in ('bookmarks', 'settings', 'history', 'open_tabs')),
  constraint yamasearch_sync_records_record_id_length
    check (char_length(record_id) between 1 and 256),
  constraint yamasearch_sync_records_settings_key
    check (collection <> 'settings' or record_id = 'browser'),
  constraint yamasearch_sync_records_schema_version check (schema_version = 1),
  constraint yamasearch_sync_records_revision_positive check (revision > 0),
  constraint yamasearch_sync_records_payload_limit
    check (octet_length(payload::text) <= 32768)
);
create index if not exists yamasearch_sync_records_pull_idx
  on public.yamasearch_sync_records (user_id, profile_id, collection, updated_at, record_id);
create index if not exists yamasearch_sync_records_device_owner_idx
  on public.yamasearch_sync_records (device_id, user_id);
create index if not exists yamasearch_sync_records_profile_owner_idx
  on public.yamasearch_sync_records (profile_id, user_id);
create index if not exists yamasearch_sync_records_tombstone_idx
  on public.yamasearch_sync_records (deleted_at)
  where deleted_at is not null;

create or replace function public.yamasearch_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.clock_timestamp();
  return new;
end;
$$;

create or replace function public.yamasearch_stamp_sync_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision = 1;
    new.created_at = pg_catalog.clock_timestamp();
  else
    if new.profile_id <> old.profile_id
      or new.user_id <> old.user_id
      or new.collection <> old.collection
      or new.record_id <> old.record_id then
      raise exception 'Sync record ownership and key are immutable.' using errcode = '22023';
    end if;
    new.created_at = old.created_at;
    new.revision = old.revision + 1;
  end if;
  new.schema_version = 1;
  new.updated_at = pg_catalog.clock_timestamp();
  return new;
end;
$$;

drop trigger if exists yamasearch_accounts_updated_at on public.yamasearch_accounts;
create trigger yamasearch_accounts_updated_at
before update on public.yamasearch_accounts
for each row execute function public.yamasearch_set_updated_at();
drop trigger if exists yamasearch_profiles_updated_at on public.yamasearch_browser_profiles;
create trigger yamasearch_profiles_updated_at
before update on public.yamasearch_browser_profiles
for each row execute function public.yamasearch_set_updated_at();
drop trigger if exists yamasearch_preferences_updated_at on public.yamasearch_sync_preferences;
create trigger yamasearch_preferences_updated_at
before update on public.yamasearch_sync_preferences
for each row execute function public.yamasearch_set_updated_at();
drop trigger if exists yamasearch_sync_records_stamp on public.yamasearch_sync_records;
create trigger yamasearch_sync_records_stamp
before insert or update on public.yamasearch_sync_records
for each row execute function public.yamasearch_stamp_sync_record();

create or replace function public.yamasearch_create_user_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile uuid := gen_random_uuid();
  avatar text;
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

  avatar := nullif(new.raw_user_meta_data ->> 'avatar_url', '');
  if avatar is not null and (avatar !~ '^https://' or char_length(avatar) > 2048) then avatar := null; end if;

  insert into public.yamasearch_accounts (user_id, display_name, avatar_url, preferred_provider)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), split_part(coalesce(new.email, ''), '@', 1), ''), 80),
    avatar,
    left(nullif(new.raw_app_meta_data ->> 'provider', ''), 80)
  ) on conflict (user_id) do nothing;

  insert into public.yamasearch_browser_profiles (id, user_id, name, is_default)
  values (profile, new.id, 'Osobní', true)
  on conflict (user_id) where is_default do nothing;

  select id into profile
  from public.yamasearch_browser_profiles
  where user_id = new.id and is_default
  limit 1;

  insert into public.yamasearch_sync_preferences (profile_id, user_id)
  values (profile, new.id)
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

drop trigger if exists yamasearch_on_auth_user_created on auth.users;
create trigger yamasearch_on_auth_user_created
after insert on auth.users
for each row execute function public.yamasearch_create_user_rows();

create or replace function public.yamasearch_ensure_account()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  profile uuid;
begin
  if uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Authenticated non-anonymous account required.' using errcode = '42501';
  end if;

  insert into public.yamasearch_accounts (user_id)
  values (uid)
  on conflict (user_id) do nothing;

  select id into profile
  from public.yamasearch_browser_profiles
  where user_id = uid and is_default
  limit 1;

  if profile is null then
    insert into public.yamasearch_browser_profiles (user_id, name, is_default)
    values (uid, 'Osobní', true)
    on conflict (user_id) where is_default do nothing
    returning id into profile;
    if profile is null then
      select id into profile
      from public.yamasearch_browser_profiles
      where user_id = uid and is_default
      limit 1;
    end if;
  end if;

  insert into public.yamasearch_sync_preferences (profile_id, user_id)
  values (profile, uid)
  on conflict (profile_id) do nothing;
  return profile;
end;
$$;

create or replace function public.yamasearch_register_device(
  device uuid,
  profile uuid,
  device_name text,
  device_platform text,
  client_version text
)
returns public.yamasearch_devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result public.yamasearch_devices%rowtype;
  device_count integer;
begin
  if uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Authenticated non-anonymous account required.' using errcode = '42501';
  end if;
  if char_length(device_name) not between 1 and 100
    or device_platform not in ('windows', 'android', 'ios-pwa')
    or char_length(client_version) > 40 then
    raise exception 'Invalid device metadata.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.yamasearch_browser_profiles p where p.id = profile and p.user_id = uid) then
    raise exception 'Profile does not belong to current user.' using errcode = '42501';
  end if;

  perform 1
  from public.yamasearch_accounts a
  where a.user_id = uid
  for update;
  if not found then
    raise exception 'YamaSearch account not found.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.yamasearch_devices d where d.id = device and d.user_id = uid) then
    select count(*) into device_count
    from public.yamasearch_devices d
    where d.user_id = uid;
    if device_count >= 20 then
      raise exception 'Device quota exceeded.' using errcode = '54000';
    end if;
  end if;

  insert into public.yamasearch_devices (id, user_id, profile_id, name, platform, app_version)
  values (device, uid, profile, device_name, device_platform, client_version)
  on conflict (id) do update
    set profile_id = excluded.profile_id,
        name = excluded.name,
        platform = excluded.platform,
        app_version = excluded.app_version,
        last_seen_at = pg_catalog.clock_timestamp()
    where public.yamasearch_devices.user_id = uid
  returning * into result;
  if result.id is null then raise exception 'Device identifier belongs to another account.' using errcode = '42501'; end if;
  return result;
end;
$$;

create or replace function public.yamasearch_set_sync_preferences(
  profile uuid,
  bookmarks boolean,
  settings boolean,
  history boolean,
  open_tabs boolean
)
returns public.yamasearch_sync_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result public.yamasearch_sync_preferences%rowtype;
begin
  if uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Authenticated non-anonymous account required.' using errcode = '42501';
  end if;
  update public.yamasearch_sync_preferences
  set sync_bookmarks = bookmarks,
      sync_settings = settings,
      sync_history = history,
      sync_open_tabs = open_tabs
  where profile_id = profile and user_id = uid
  returning * into result;
  if result.profile_id is null then raise exception 'Sync profile not found.' using errcode = '42501'; end if;

  delete from public.yamasearch_sync_records r
  where r.profile_id = profile and r.user_id = uid
    and ((r.collection = 'bookmarks' and not bookmarks)
      or (r.collection = 'settings' and not settings)
      or (r.collection = 'history' and not history)
      or (r.collection = 'open_tabs' and not open_tabs));
  return result;
end;
$$;

create or replace function public.yamasearch_upsert_sync_record(
  profile uuid,
  collection_name text,
  record_key text,
  record_payload jsonb,
  expected_revision bigint,
  source_device uuid default null,
  tombstone boolean default false,
  payload_schema_version integer default 1
)
returns public.yamasearch_sync_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  current_revision bigint;
  category_enabled boolean;
  category_limit integer;
  profile_payload_bytes bigint;
  stored_payload jsonb;
  result public.yamasearch_sync_records%rowtype;
begin
  if uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Authenticated non-anonymous account required.' using errcode = '42501';
  end if;
  stored_payload := case when tombstone then '{}'::jsonb else coalesce(record_payload, '{}'::jsonb) end;
  if expected_revision is null
    or collection_name not in ('bookmarks', 'settings', 'history', 'open_tabs')
    or char_length(record_key) not between 1 and 256
    or payload_schema_version <> 1
    or octet_length(stored_payload::text) > 32768
    or jsonb_typeof(stored_payload) <> 'object'
    or (collection_name = 'settings' and record_key <> 'browser') then
    raise exception 'Invalid sync record.' using errcode = '22023';
  end if;
  if collection_name in ('bookmarks', 'history', 'open_tabs') and not tombstone then
    if jsonb_typeof(stored_payload -> 'url') is distinct from 'string'
      or char_length(stored_payload ->> 'url') not between 1 and 8192 then
      raise exception 'Sync record URL is missing or invalid.' using errcode = '22023';
    end if;
  end if;
  if source_device is not null and not exists (
    select 1 from public.yamasearch_devices d where d.id = source_device and d.user_id = uid and d.profile_id = profile
  ) then
    raise exception 'Source device does not belong to profile.' using errcode = '42501';
  end if;

  select case collection_name
      when 'bookmarks' then p.sync_bookmarks
      when 'settings' then p.sync_settings
      when 'history' then p.sync_history
      when 'open_tabs' then p.sync_open_tabs
    end
  into category_enabled
  from public.yamasearch_sync_preferences p
  where p.profile_id = profile and p.user_id = uid
  for update;
  if not coalesce(category_enabled, false) then
    raise exception 'This sync category is disabled.' using errcode = '42501';
  end if;

  select r.revision into current_revision
  from public.yamasearch_sync_records r
  where r.profile_id = profile and r.collection = collection_name and r.record_id = record_key and r.user_id = uid
  for update;

  select coalesce(sum(octet_length(r.payload::text)), 0) + octet_length(stored_payload::text)
  into profile_payload_bytes
  from public.yamasearch_sync_records r
  where r.profile_id = profile
    and r.user_id = uid
    and not (r.collection = collection_name and r.record_id = record_key);
  if profile_payload_bytes > 33554432 then
    raise exception 'Sync profile storage quota exceeded.' using errcode = '54000';
  end if;

  if current_revision is null then
    if expected_revision <> 0 then raise exception 'Sync revision conflict.' using errcode = '40001'; end if;
    category_limit := case collection_name when 'settings' then 1 when 'bookmarks' then 5000 when 'history' then 20000 else 1000 end;
    if (select count(*) from public.yamasearch_sync_records r where r.profile_id = profile and r.collection = collection_name) >= category_limit then
      raise exception 'Sync category quota exceeded.' using errcode = '54000';
    end if;
    insert into public.yamasearch_sync_records
      (profile_id, user_id, collection, record_id, schema_version, payload, deleted_at, device_id)
    values
       (profile, uid, collection_name, record_key, 1, stored_payload,
       case when tombstone then pg_catalog.clock_timestamp() else null end, source_device)
    returning * into result;
  else
    if current_revision <> expected_revision then raise exception 'Sync revision conflict.' using errcode = '40001'; end if;
    update public.yamasearch_sync_records r
    set payload = stored_payload,
        deleted_at = case when tombstone then pg_catalog.clock_timestamp() else null end,
        device_id = source_device
    where r.profile_id = profile and r.collection = collection_name and r.record_id = record_key and r.user_id = uid
    returning * into result;
  end if;
  return result;
end;
$$;

create or replace function public.yamasearch_purge_old_tombstones()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare removed bigint;
begin
  delete from public.yamasearch_sync_records
  where deleted_at < pg_catalog.clock_timestamp() - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

select cron.schedule(
  'yamasearch-purge-old-tombstones',
  '17 3 * * *',
  'select public.yamasearch_purge_old_tombstones()'
);

alter table public.yamasearch_accounts enable row level security;
alter table public.yamasearch_browser_profiles enable row level security;
alter table public.yamasearch_sync_preferences enable row level security;
alter table public.yamasearch_devices enable row level security;
alter table public.yamasearch_sync_records enable row level security;

revoke all on public.yamasearch_accounts from anon, authenticated;
revoke all on public.yamasearch_browser_profiles from anon, authenticated;
revoke all on public.yamasearch_sync_preferences from anon, authenticated;
revoke all on public.yamasearch_devices from anon, authenticated;
revoke all on public.yamasearch_sync_records from anon, authenticated;
grant select, update (display_name, avatar_url, preferred_provider) on public.yamasearch_accounts to authenticated;
grant select on public.yamasearch_browser_profiles to authenticated;
grant select on public.yamasearch_sync_preferences to authenticated;
grant select on public.yamasearch_devices to authenticated;
grant select on public.yamasearch_sync_records to authenticated;
grant select on public.yamasearch_accounts, public.yamasearch_browser_profiles,
  public.yamasearch_sync_preferences, public.yamasearch_devices, public.yamasearch_sync_records to service_role;

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

revoke all on function public.yamasearch_set_updated_at() from public, anon, authenticated;
revoke all on function public.yamasearch_stamp_sync_record() from public, anon, authenticated;
revoke all on function public.yamasearch_create_user_rows() from public, anon, authenticated;
revoke all on function public.yamasearch_ensure_account() from public, anon, authenticated;
revoke all on function public.yamasearch_register_device(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.yamasearch_set_sync_preferences(uuid, boolean, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.yamasearch_upsert_sync_record(uuid, text, text, jsonb, bigint, uuid, boolean, integer) from public, anon, authenticated;
revoke all on function public.yamasearch_purge_old_tombstones() from public, anon, authenticated, service_role;
grant execute on function public.yamasearch_ensure_account() to authenticated;
grant execute on function public.yamasearch_register_device(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.yamasearch_set_sync_preferences(uuid, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.yamasearch_upsert_sync_record(uuid, text, text, jsonb, bigint, uuid, boolean, integer) to authenticated;
grant execute on function public.yamasearch_purge_old_tombstones() to service_role;
