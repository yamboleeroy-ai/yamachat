-- Destructive permissions require access to the matching read view.
alter table private.platform_role_assignments
  drop constraint if exists platform_role_assignments_users_suspend_requires_read,
  drop constraint if exists platform_role_assignments_storage_delete_requires_read;

alter table private.platform_role_assignments
  add constraint platform_role_assignments_users_suspend_requires_read
    check (not ('users.suspend' = any(permissions)) or 'users.read' = any(permissions)),
  add constraint platform_role_assignments_storage_delete_requires_read
    check (not ('storage.delete' = any(permissions)) or 'storage.read' = any(permissions));
