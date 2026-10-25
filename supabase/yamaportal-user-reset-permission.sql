alter table private.platform_role_assignments
  drop constraint if exists platform_role_assignments_permissions_check;

alter table private.platform_role_assignments
  add constraint platform_role_assignments_permissions_check
    check (permissions <@ array[
      'users.read', 'users.suspend', 'users.reset_password', 'storage.read', 'storage.delete'
    ]::text[]);

alter table private.platform_role_assignments
  drop constraint if exists platform_role_assignments_users_reset_requires_read;

alter table private.platform_role_assignments
  add constraint platform_role_assignments_users_reset_requires_read
    check (not ('users.reset_password' = any(permissions)) or 'users.read' = any(permissions));
