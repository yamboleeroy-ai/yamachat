begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_anonymous
) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'one@example.test', '', clock_timestamp(),
   '{"provider":"google","providers":["google"]}'::jsonb,
   '{"full_name":"Test One"}'::jsonb, clock_timestamp(), clock_timestamp(), false),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'two@example.test', '', clock_timestamp(),
   '{"provider":"azure","providers":["azure"]}'::jsonb,
   '{"full_name":"Test Two"}'::jsonb, clock_timestamp(), clock_timestamp(), false),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', null, '', null, '{}'::jsonb, '{}'::jsonb,
   clock_timestamp(), clock_timestamp(), true);

do $test$
begin
  if (select count(*) from public.yamasearch_accounts where user_id in (
    '10000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000002'::uuid
  )) <> 2 then
    raise exception 'non-anonymous bootstrap failed';
  end if;
  if exists (
    select 1 from public.yamasearch_accounts
    where user_id = '10000000-0000-0000-0000-000000000003'::uuid
  ) then
    raise exception 'anonymous user created account rows';
  end if;
end
$test$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',
  true
);

do $test$
declare
  profile uuid;
  device uuid := '20000000-0000-0000-0000-000000000001'::uuid;
  record public.yamasearch_sync_records%rowtype;
begin
  profile := public.yamasearch_ensure_account();
  perform public.yamasearch_set_sync_preferences(profile, true, false, false, false);
  perform public.yamasearch_register_device(device, profile, 'Test Windows', 'windows', '0.0-test');

  record := public.yamasearch_upsert_sync_record(
    profile, 'bookmarks', 'bookmark-1',
    '{"url":"https://example.test","title":"Example"}'::jsonb,
    0, device, false, 1
  );
  if record.revision <> 1 then raise exception 'initial revision mismatch'; end if;

  record := public.yamasearch_upsert_sync_record(
    profile, 'bookmarks', 'bookmark-1',
    '{"url":"https://example.test/updated","title":"Updated"}'::jsonb,
    1, device, false, 1
  );
  if record.revision <> 2 then raise exception 'updated revision mismatch'; end if;

  begin
    perform public.yamasearch_upsert_sync_record(
      profile, 'bookmarks', 'null-revision', '{"url":"https://example.test/null"}'::jsonb,
      null, device, false, 1
    );
    raise exception 'null expected_revision was accepted';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.yamasearch_upsert_sync_record(
      profile, 'history', 'disabled-history', '{"url":"https://example.test/history"}'::jsonb,
      0, device, false, 1
    );
    raise exception 'disabled history was accepted';
  exception when sqlstate '42501' then null;
  end;

  perform public.yamasearch_set_sync_preferences(profile, false, false, false, false);
  if exists (
    select 1 from public.yamasearch_sync_records
    where profile_id = profile and collection = 'bookmarks'
  ) then
    raise exception 'disabled category was not purged';
  end if;

  perform public.yamasearch_set_sync_preferences(profile, true, false, false, false);
  record := public.yamasearch_upsert_sync_record(
    profile, 'bookmarks', 'deleted-bookmark', '{"secret":"must-not-survive"}'::jsonb,
    0, device, true, 1
  );
  if record.payload <> '{}'::jsonb or record.deleted_at is null then
    raise exception 'tombstone retained payload or timestamp missing';
  end if;

  if (select count(*) from public.yamasearch_accounts) <> 1 then
    raise exception 'RLS exposed another account';
  end if;
end
$test$;

rollback;
