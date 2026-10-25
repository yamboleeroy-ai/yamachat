import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Cache-Control': 'no-store, max-age=0'
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }
  })

const clean = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const durations: Record<string,string> = {
  '24h': '24h',
  '7d': '168h',
  '30d': '720h',
  'permanent': '876000h'
}
const STORAGE_OBJECT_LIMIT = 5000

async function storageInventory(service: ReturnType<typeof createClient>) {
  const { data: buckets, error: bucketError } = await service.storage.listBuckets()
  if (bucketError) throw new Error('Unable to list storage buckets')
  const objects: Array<{ bucket_id: string; path: string; size: number; created_at: string | null }> = []
  const totals = new Map<string, { count: number; bytes: number }>()
  let truncated = false

  for (const bucket of buckets || []) {
    const total = { count: 0, bytes: 0 }
    totals.set(bucket.id, total)
    const pending = ['']
    let prefixCount = 0
    while (pending.length) {
      const prefix = pending.shift()!
      prefixCount++
      if (prefixCount > 1000 || objects.length >= STORAGE_OBJECT_LIMIT) { truncated = true; break }
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await service.storage.from(bucket.id).list(prefix, {
          limit: 100,
          offset,
          sortBy: { column: 'name', order: 'asc' }
        })
        if (error) throw new Error('Unable to read storage metadata')
        const entries = data || []
        for (const entry of entries) {
          const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name
          if (!entry.id && !entry.metadata) { pending.push(objectPath); continue }
          const size = Math.max(0, Number(entry.metadata?.size) || 0)
          total.count++
          total.bytes += size
          if (objects.length < STORAGE_OBJECT_LIMIT) objects.push({
            bucket_id: bucket.id,
            path: objectPath,
            size,
            created_at: entry.created_at || entry.updated_at || null
          })
          else truncated = true
        }
        if (entries.length < 100 || objects.length >= STORAGE_OBJECT_LIMIT) {
          if (objects.length >= STORAGE_OBJECT_LIMIT && entries.length === 100) truncated = true
          break
        }
      }
      if (objects.length >= STORAGE_OBJECT_LIMIT) { truncated = true; break }
    }
    if (truncated) break
  }

  return {
    buckets: (buckets || []).map(bucket => ({
      id: bucket.id,
      name: bucket.name,
      public: !!bucket.public,
      file_size_limit: bucket.file_size_limit ?? null,
      file_count: totals.get(bucket.id)?.count || 0,
      bytes: totals.get(bucket.id)?.bytes || 0
    })),
    objects,
    truncated,
    object_limit: STORAGE_OBJECT_LIMIT
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const authorization = req.headers.get('Authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!url || !anonKey || !serviceKey) return json({ error: 'Server configuration missing' }, 503)
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { data: callerData, error: callerError } = await caller.auth.getUser(token)
  const actor = callerData?.user
  if (callerError || !actor?.id) return json({ error: 'Unauthorized' }, 401)

  let payload: any = {}
  try { payload = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const action = clean(payload?.action, 40)

  if (action === 'owner-status') {
    const { data, error } = await service.rpc('service_is_platform_owner', { p_user_id: actor.id })
    if (error) return json({ error: 'Unable to verify owner role' }, 503)
    return json({ ok: true, is_owner: data === true })
  }

  if (action === 'access-status') {
    const { data, error } = await service.rpc('service_get_platform_access', { p_user_id: actor.id })
    if (error) return json({ error: 'Unable to load platform access' }, 503)
    const access = Array.isArray(data) ? data[0] : null
    return json({ ok: true, is_owner: access?.is_owner === true, role: access?.role || 'USER', permissions: access?.permissions || [] })
  }

  if (action === 'self-status') {
    const { data, error } = await service.auth.admin.getUserById(actor.id)
    if (error || !data?.user) return json({ error: 'Unable to read account status' }, 500)
    const bannedUntil = data.user.banned_until || null
    return json({
      ok: true,
      banned_until: bannedUntil,
      is_banned: !!(bannedUntil && new Date(bannedUntil).getTime() > Date.now())
    })
  }

  const ownerOnly = action === 'role-set' || action === 'role-audit'
  if (ownerOnly) {
    const { data: isOwner, error: ownerError } = await service.rpc('service_is_platform_owner', { p_user_id: actor.id })
    if (ownerError) return json({ error: 'Unable to verify owner role' }, 503)
    if (isOwner !== true) return json({ error: 'Owner access required' }, 403)
  }

  const requiredPermission: Record<string, string> = {
    'storage-summary': 'storage.read',
    'storage-audit': 'storage.read',
    'storage-delete': 'storage.delete',
    list: 'users.read',
    'user-audit': 'users.read',
    'role-list': 'users.read',
    ban: 'users.suspend',
    unban: 'users.suspend',
    'reset-password': 'users.reset_password'
  }
  const permission = requiredPermission[action]
  if (!permission && !ownerOnly) return json({ error: 'Unknown action' }, 400)
  if (permission) {
    const { data: allowed, error: permissionError } = await service.rpc('service_user_has_platform_permission', {
      p_user_id: actor.id,
      p_permission: permission
    })
    if (permissionError) return json({ error: 'Unable to verify platform permission' }, 503)
    if (allowed !== true) return json({ error: 'Forbidden' }, 403)
  }

  if (action === 'role-list') {
    const { data, error } = await service.rpc('service_list_platform_roles', { p_actor_user_id: actor.id })
    if (error) return json({ error: 'Unable to load platform roles' }, 503)
    return json({ ok: true, roles: data || [] })
  }

  if (action === 'user-audit') {
    const { data, error } = await service.from('platform_admin_user_audit')
      .select('actor_user_id,target_user_id,action,outcome,reason,created_at')
      .order('created_at', { ascending: false }).limit(100)
    if (error) return json({ error: 'Historii úkonů účtů se nepodařilo načíst.' }, 503)
    return json({ ok: true, entries: data || [] })
  }

  if (action === 'role-set') {
    const userId = clean(payload?.user_id, 80)
    const role = clean(payload?.role, 20).toUpperCase()
    const permissions = Array.isArray(payload?.permissions)
      ? payload.permissions.filter((value: unknown): value is string => typeof value === 'string').slice(0, 9)
      : []
    const reason = clean(payload?.reason, 500)
    if (!isUuid(userId)) return json({ error: 'Invalid user id' }, 400)
    if (!['ADMIN', 'MODERATOR', 'USER'].includes(role)) return json({ error: 'Invalid platform role' }, 400)
    if (permissions.length > 8 || new Set(permissions).size !== permissions.length) return json({ error: 'Invalid permission set' }, 400)
    if (reason.length < 2) return json({ error: 'Zadej důvod změny role.' }, 400)
    const { error } = await service.rpc('service_set_platform_role', {
      p_actor_user_id: actor.id,
      p_target_user_id: userId,
      p_role: role,
      p_permissions: permissions,
      p_reason: reason
    })
    if (error) return json({ error: 'Změnu role se nepodařilo bezpečně uložit.' }, 400)
    return json({ ok: true, user_id: userId, role, permissions })
  }

  if (action === 'role-audit') {
    const { data, error } = await service.rpc('service_list_platform_role_audit', { p_actor_user_id: actor.id })
    if (error) return json({ error: 'Historii změn rolí se nepodařilo načíst.' }, 503)
    return json({ ok: true, entries: data || [] })
  }

  if (action === 'reset-password') {
    const userId = clean(payload?.user_id, 80)
    const reason = clean(payload?.reason, 500)
    if (!isUuid(userId)) return json({ error: 'Invalid user id' }, 400)
    if (reason.length < 2) return json({ error: 'Zadej důvod odeslání obnovy hesla.' }, 400)
    const { data: isTargetOwner, error: targetOwnerError } = await service.rpc('service_is_platform_owner', { p_user_id: userId })
    if (targetOwnerError) return json({ error: 'Unable to verify target role' }, 503)
    if (isTargetOwner === true) return json({ error: 'Obnovu hesla účtu vlastníka proveď běžným postupem pro vlastní účet.' }, 403)
    const { data: target, error: targetError } = await service.auth.admin.getUserById(userId)
    if (targetError || !target?.user?.email) return json({ error: 'E-mail cílového účtu není dostupný.' }, 404)
    const { data: audit, error: auditError } = await service.from('platform_admin_user_audit').insert({
      actor_user_id: actor.id,
      target_user_id: userId,
      action: 'password-reset-email',
      outcome: 'started',
      reason
    }).select('id').single()
    if (auditError || !audit?.id) return json({ error: 'E-mail nebyl odeslán, protože se nepodařilo zapsat audit.' }, 503)
    const { error: resetError } = await service.auth.resetPasswordForEmail(target.user.email)
    const outcome = resetError ? 'failed' : 'succeeded'
    const { error: auditUpdateError } = await service.from('platform_admin_user_audit').update({ outcome }).eq('id', audit.id)
    if (resetError) return json({ error: 'Odeslání odkazu pro obnovu se nepodařilo.', audit_logged: !auditUpdateError }, 503)
    if (auditUpdateError) return json({ error: 'E-mail byl odeslán, ale konečný stav auditu se nepodařilo uložit.', audit_id: audit.id }, 500)
    return json({ ok: true, audit_id: audit.id })
  }

  if (action === 'storage-summary') {
    try { return json({ ok: true, ...(await storageInventory(service)) }) }
    catch (error) { console.error('Yamachat storage inventory failed', error); return json({ error: 'Storage metadata is currently unavailable' }, 503) }
  }

  if (action === 'storage-audit') {
    const { data, error } = await service.from('platform_admin_storage_audit')
      .select('id,actor_user_id,action,bucket_id,object_path,object_size,outcome,created_at')
      .order('created_at', { ascending: false }).limit(100)
    if (error) return json({ error: 'Storage audit history is currently unavailable' }, 503)
    return json({ ok: true, entries: data || [] })
  }

  if (action === 'storage-delete') {
    const bucketId = clean(payload?.bucket_id, 100)
    const objectPath = String(payload?.path ?? '')
    const confirmPath = String(payload?.confirm_path ?? '')
    if (!bucketId || !objectPath || objectPath.length > 1024 || objectPath.startsWith('/') || objectPath.split('/').some(part => !part || part === '.' || part === '..') || /[\u0000-\u001f]/.test(objectPath))
      return json({ error: 'Invalid storage object path' }, 400)
    if (confirmPath !== objectPath) return json({ error: 'Type the exact object path to confirm deletion' }, 400)
    const inventory = await storageInventory(service).catch(() => null)
    const object = inventory?.objects.find(item => item.bucket_id === bucketId && item.path === objectPath)
    if (!object) return json({ error: inventory?.truncated ? 'Object not found in the bounded inventory; refresh and use a visible object.' : 'Object not found' }, 404)
    const { data: audit, error: auditError } = await service.from('platform_admin_storage_audit').insert({
      actor_user_id: actor.id,
      action: 'delete-object',
      bucket_id: bucketId,
      object_path: objectPath,
      object_size: object.size,
      outcome: 'started'
    }).select('id').single()
    if (auditError || !audit?.id) return json({ error: 'Deletion was not started because audit logging is unavailable' }, 503)
    const { error: deleteError } = await service.storage.from(bucketId).remove([objectPath])
    const outcome = deleteError ? 'failed' : 'succeeded'
    const { error: auditUpdateError } = await service.from('platform_admin_storage_audit').update({ outcome }).eq('id', audit.id)
    if (deleteError) return json({ error: 'Storage object was not deleted', audit_logged: !auditUpdateError }, 500)
    if (auditUpdateError) return json({ error: 'Object was deleted, but the final audit status could not be saved', audit_id: audit.id }, 500)
    return json({ ok: true, bucket_id: bucketId, path: objectPath, size: object.size, audit_id: audit.id })
  }

  if (action === 'list') {
    const page = Math.max(1, Math.min(1000, Number(payload?.page) || 1))
    const perPage = Math.max(1, Math.min(1000, Number(payload?.perPage) || 1000))
    const search = clean(payload?.search, 200).toLowerCase()

    const { data, error } = await service.auth.admin.listUsers({ page, perPage })
    if (error) return json({ error: error.message }, 500)
    const authUsers = data?.users || []
    const ids = authUsers.map(u => u.id)

    let profiles: any[] = []
    let actions: any[] = []
    if (ids.length) {
      const [profileResult, actionResult] = await Promise.all([
        service.from('profiles').select('id,username,display_name,created_at').in('id', ids),
        service.from('platform_user_moderation_actions')
          .select('target_user_id,action,duration,reason,created_at,actor_user_id')
          .in('target_user_id', ids)
          .order('created_at', { ascending: false })
          .limit(5000)
      ])
      if (profileResult.error) return json({ error: profileResult.error.message }, 500)
      if (actionResult.error) return json({ error: actionResult.error.message }, 500)
      profiles = profileResult.data || []
      actions = actionResult.data || []
    }

    const profileById = new Map(profiles.map(p => [p.id, p]))
    const latestAction = new Map<string, any>()
    for (const item of actions) if (!latestAction.has(item.target_user_id)) latestAction.set(item.target_user_id, item)

    let users = authUsers.map(u => {
      const p = profileById.get(u.id) || {}
      const bannedUntil = u.banned_until || null
      return {
        id: u.id,
        email: u.email || '',
        username: p.username || '',
        display_name: p.display_name || '',
        created_at: u.created_at || p.created_at || null,
        last_sign_in_at: u.last_sign_in_at || null,
        email_confirmed_at: u.email_confirmed_at || null,
        is_anonymous: !!u.is_anonymous,
        banned_until: bannedUntil,
        is_banned: !!(bannedUntil && new Date(bannedUntil).getTime() > Date.now()),
        moderation: latestAction.get(u.id) || null
      }
    })

    if (search) {
      users = users.filter(u =>
        [u.email, u.username, u.display_name, u.id].some(v => String(v || '').toLowerCase().includes(search))
      )
    }

    return json({ ok: true, users, page, perPage, count: users.length })
  }

  if (action === 'ban' || action === 'unban') {
    const targetUserId = clean(payload?.user_id, 80)
    if (!isUuid(targetUserId)) return json({ error: 'Invalid user id' }, 400)

    if (action === 'ban') {
      if (targetUserId === actor.id) return json({ error: 'Nemůžeš zabanovat vlastní Platform Admin účet.' }, 400)
      const durationKey = clean(payload?.duration, 20)
      const banDuration = durations[durationKey]
      const reason = clean(payload?.reason, 500)
      if (!banDuration) return json({ error: 'Invalid ban duration' }, 400)
      if (reason.length < 2) return json({ error: 'Zadej důvod banu.' }, 400)

      const { data: targetIsAdmin, error: targetAdminError } =
        await service.rpc('service_is_platform_admin', { p_user_id: targetUserId })
      if (targetAdminError) return json({ error: targetAdminError.message }, 500)
      if (targetIsAdmin === true) return json({ error: 'Platform Admin účet nelze zabanovat.' }, 400)

      const { data: roleRows, error: rolesError } = await service.rpc('service_list_platform_roles', { p_actor_user_id: actor.id })
      if (rolesError) return json({ error: 'Unable to verify target role' }, 503)
      const targetRole = (roleRows || []).find((row: any) => row.user_id === targetUserId)?.role || 'USER'
      const { data: actorIsOwner, error: actorOwnerError } = await service.rpc('service_is_platform_owner', { p_user_id: actor.id })
      if (actorOwnerError) return json({ error: 'Unable to verify owner role' }, 503)
      if (!actorIsOwner && targetRole !== 'USER') return json({ error: 'Only the owner may suspend a platform admin or moderator.' }, 403)

      const { data: adminAudit, error: adminAuditError } = await service.from('platform_admin_user_audit').insert({
        actor_user_id: actor.id,
        target_user_id: targetUserId,
        action: 'account-ban',
        outcome: 'started',
        reason
      }).select('id').single()
      if (adminAuditError || !adminAudit?.id) return json({ error: 'Pozastavení nebylo zahájeno, protože se nepodařilo zapsat audit.' }, 503)

      const { data: updated, error } = await service.auth.admin.updateUserById(targetUserId, {
        ban_duration: banDuration
      })
      if (error) {
        await service.from('platform_admin_user_audit').update({ outcome: 'failed' }).eq('id', adminAudit.id)
        return json({ error: error.message }, 500)
      }

      const { error: adminAuditUpdateError } = await service.from('platform_admin_user_audit').update({ outcome: 'succeeded' }).eq('id', adminAudit.id)

      const audit = await service.from('platform_user_moderation_actions').insert({
        target_user_id: targetUserId,
        actor_user_id: actor.id,
        action: 'ban',
        duration: durationKey,
        reason
      })

      return json({
        ok: true,
        user_id: targetUserId,
        banned_until: updated?.user?.banned_until || null,
        audit_warning: audit.error?.message || adminAuditUpdateError?.message || null
      })
    }

    const reason = clean(payload?.reason, 500)
    if (reason.length < 2) return json({ error: 'Zadej důvod zrušení pozastavení.' }, 400)
    const { data: adminAudit, error: adminAuditError } = await service.from('platform_admin_user_audit').insert({
      actor_user_id: actor.id,
      target_user_id: targetUserId,
      action: 'account-unban',
      outcome: 'started',
      reason
    }).select('id').single()
    if (adminAuditError || !adminAudit?.id) return json({ error: 'Odblokování nebylo zahájeno, protože se nepodařilo zapsat audit.' }, 503)

    const { data: updated, error } = await service.auth.admin.updateUserById(targetUserId, {
      ban_duration: 'none'
    })
    if (error) {
      await service.from('platform_admin_user_audit').update({ outcome: 'failed' }).eq('id', adminAudit.id)
      return json({ error: error.message }, 500)
    }

    const { error: adminAuditUpdateError } = await service.from('platform_admin_user_audit').update({ outcome: 'succeeded' }).eq('id', adminAudit.id)

    const audit = await service.from('platform_user_moderation_actions').insert({
      target_user_id: targetUserId,
      actor_user_id: actor.id,
      action: 'unban',
      duration: null,
      reason: reason || null
    })

    return json({
      ok: true,
      user_id: targetUserId,
      banned_until: updated?.user?.banned_until || null,
      audit_warning: audit.error?.message || adminAuditUpdateError?.message || null
    })
  }

  return json({ error: 'Unknown action' }, 400)
})
