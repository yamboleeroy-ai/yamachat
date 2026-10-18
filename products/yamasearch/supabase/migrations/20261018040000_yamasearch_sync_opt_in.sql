alter table public.yamasearch_sync_preferences
  alter column sync_bookmarks set default false,
  alter column sync_settings set default false;

update public.yamasearch_sync_preferences
set sync_bookmarks = false,
    sync_settings = false
where sync_bookmarks or sync_settings;
