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

  const { data: isAdmin, error: adminError } = await caller.rpc('platform_admin_status')
  if (adminError || isAdmin !== true) return json({ error: 'Forbidden' }, 403)

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

      const { data: updated, error } = await service.auth.admin.updateUserById(targetUserId, {
        ban_duration: banDuration
      })
      if (error) return json({ error: error.message }, 500)

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
        audit_warning: audit.error?.message || null
      })
    }

    const { data: updated, error } = await service.auth.admin.updateUserById(targetUserId, {
      ban_duration: 'none'
    })
    if (error) return json({ error: error.message }, 500)

    const reason = clean(payload?.reason, 500)
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
      audit_warning: audit.error?.message || null
    })
  }

  return json({ error: 'Unknown action' }, 400)
})
