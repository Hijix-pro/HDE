import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

type ManagerGate =
  | { ok: true; client: SupabaseClient; user: User; restaurantId: string; platformRole: string; membershipRole: string }
  | { ok: false; response: NextResponse }

async function requireRestaurantManager(request: Request, restaurantId: string): Promise<ManagerGate> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secretKey) {
    return { ok: false, response: NextResponse.json({ error: 'La gestion admin n’est pas configurée sur le serveur.' }, { status: 503 }) }
  }
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }) }
  }
  if (!restaurantId) {
    return { ok: false, response: NextResponse.json({ error: 'Restaurant non indiqué.' }, { status: 400 }) }
  }

  const client = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: { user }, error: authError } = await client.auth.getUser(token)
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Session invalide. Connectez-vous de nouveau.' }, { status: 401 }) }
  }

  const [profileResult, membershipResult] = await Promise.all([
    client.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    client.from('restaurant_members').select('role').eq('restaurant_id', restaurantId).eq('user_id', user.id).maybeSingle(),
  ])
  if (profileResult.error || membershipResult.error) {
    return { ok: false, response: NextResponse.json({ error: 'Impossible de vérifier les droits sur ce restaurant.' }, { status: 500 }) }
  }
  const platformRole = profileResult.data?.role ?? 'member'
  const membershipRole = membershipResult.data?.role ?? ''
  if (platformRole !== 'super_admin' && membershipRole !== 'owner' && membershipRole !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Accès réservé aux administrateurs de ce restaurant.' }, { status: 403 }) }
  }
  return { ok: true, client, user, restaurantId, platformRole, membershipRole }
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
  } catch {
    return null
  }
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function metadataName(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export async function GET(request: Request) {
  const restaurantId = new URL(request.url).searchParams.get('restaurant_id')?.trim() ?? ''
  const gate = await requireRestaurantManager(request, restaurantId)
  if (!gate.ok) return gate.response

  const { data: memberships, error: membershipsError } = await gate.client
    .from('restaurant_members')
    .select('user_id, role')
    .eq('restaurant_id', restaurantId)
  if (membershipsError) return NextResponse.json({ error: membershipsError.message }, { status: 500 })

  const memberIds = new Set((memberships ?? []).map(membership => membership.user_id))
  const { data: userPage, error: usersError } = await gate.client.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 })
  const tenantUsers = userPage.users.filter(user => memberIds.has(user.id))
  const ids = tenantUsers.map(user => user.id)
  const { data: profiles, error: profilesError } = ids.length
    ? await gate.client.from('profiles').select('id, first_name, last_name, role').in('id', ids)
    : { data: [], error: null }
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 })

  const profileById = new Map((profiles ?? []).map(profile => [profile.id, profile]))
  const membershipById = new Map((memberships ?? []).map(membership => [membership.user_id, membership]))
  const users = tenantUsers.map(user => {
    const profile = profileById.get(user.id)
    const membership = membershipById.get(user.id)
    return {
      id: user.id,
      email: user.email ?? '',
      first_name: profile?.first_name ?? metadataName(user.user_metadata?.first_name),
      last_name: profile?.last_name ?? metadataName(user.user_metadata?.last_name),
      role: profile?.role === 'super_admin' ? 'super_admin' : membership?.role === 'admin' || membership?.role === 'owner' ? 'admin' : 'member',
      workspace_role: membership?.role ?? 'member',
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
    }
  })
  return NextResponse.json({ users })
}

export async function POST(request: Request) {
  const body = await readBody(request)
  if (!body) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  const restaurantId = textValue(body.restaurant_id)
  const gate = await requireRestaurantManager(request, restaurantId)
  if (!gate.ok) return gate.response

  const email = textValue(body.email).toLowerCase()
  const firstName = textValue(body.first_name)
  const lastName = textValue(body.last_name)
  if (!email || !firstName || !lastName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Indiquez un email valide, un prénom et un nom.' }, { status: 400 })
  }

  const { data, error } = await gate.client.auth.admin.inviteUserByEmail(email, {
    data: { first_name: firstName, last_name: lastName },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { error: membershipError } = await gate.client.from('restaurant_members').insert({
    restaurant_id: restaurantId,
    user_id: data.user.id,
    role: 'member',
  })
  if (membershipError) {
    await gate.client.auth.admin.deleteUser(data.user.id)
    return NextResponse.json({ error: `Invitation annulée : ${membershipError.message}` }, { status: 500 })
  }
  return NextResponse.json({ invited: true, id: data.user.id }, { status: 201 })
}

export async function PATCH(request: Request) {
  const body = await readBody(request)
  if (!body) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  const restaurantId = textValue(body.restaurant_id)
  const gate = await requireRestaurantManager(request, restaurantId)
  if (!gate.ok) return gate.response

  if (gate.platformRole !== 'super_admin') {
    return NextResponse.json({ error: 'Seul le super admin peut modifier les rôles.' }, { status: 403 })
  }
  const id = textValue(body.id)
  const firstName = textValue(body.first_name)
  const lastName = textValue(body.last_name)
  const role = body.role
  if (!id || !firstName || !lastName || (role !== 'admin' && role !== 'member')) {
    return NextResponse.json({ error: 'Informations de membre incomplètes.' }, { status: 400 })
  }
  const nextRole = role as 'admin' | 'member'

  const { data: targetMembership, error: targetMembershipError } = await gate.client
    .from('restaurant_members')
    .select('role')
    .eq('restaurant_id', restaurantId)
    .eq('user_id', id)
    .maybeSingle()
  if (targetMembershipError) return NextResponse.json({ error: targetMembershipError.message }, { status: 500 })
  if (!targetMembership) return NextResponse.json({ error: 'Ce compte ne fait pas partie de ce restaurant.' }, { status: 404 })

  const { data: targetProfile, error: targetProfileError } = await gate.client.from('profiles').select('role').eq('id', id).maybeSingle()
  if (targetProfileError) return NextResponse.json({ error: targetProfileError.message }, { status: 500 })
  if (targetProfile?.role === 'super_admin' || targetMembership.role === 'owner') {
    return NextResponse.json({ error: 'Le compte propriétaire ou super admin est protégé.' }, { status: 400 })
  }

  const { error: metadataError } = await gate.client.auth.admin.updateUserById(id, {
    user_metadata: { first_name: firstName, last_name: lastName },
  })
  if (metadataError) return NextResponse.json({ error: metadataError.message }, { status: 400 })

  const { error: profileError } = await gate.client.from('profiles').update({ first_name: firstName, last_name: lastName }).eq('id', id)
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  const { error: membershipError } = await gate.client.from('restaurant_members')
    .update({ role: nextRole })
    .eq('restaurant_id', restaurantId)
    .eq('user_id', id)
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 })
  return NextResponse.json({ updated: true })
}

export async function DELETE(request: Request) {
  const body = await readBody(request)
  if (!body) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  const restaurantId = textValue(body.restaurant_id)
  const gate = await requireRestaurantManager(request, restaurantId)
  if (!gate.ok) return gate.response

  if (gate.platformRole !== 'super_admin') {
    return NextResponse.json({ error: 'Seul le super admin peut retirer un compte du restaurant.' }, { status: 403 })
  }
  const id = textValue(body.id)
  if (!id) return NextResponse.json({ error: 'Compte à retirer non indiqué.' }, { status: 400 })
  if (id === gate.user.id) {
    return NextResponse.json({ error: 'Vous ne pouvez pas vous retirer vous-même du restaurant.' }, { status: 400 })
  }

  const { data: targetMembership, error: targetMembershipError } = await gate.client
    .from('restaurant_members')
    .select('role')
    .eq('restaurant_id', restaurantId)
    .eq('user_id', id)
    .maybeSingle()
  if (targetMembershipError) return NextResponse.json({ error: targetMembershipError.message }, { status: 500 })
  if (!targetMembership) return NextResponse.json({ error: 'Ce compte ne fait pas partie de ce restaurant.' }, { status: 404 })
  if (targetMembership.role === 'owner') {
    return NextResponse.json({ error: 'Le propriétaire du restaurant ne peut pas être retiré.' }, { status: 400 })
  }

  const { error } = await gate.client.from('restaurant_members')
    .delete()
    .eq('restaurant_id', restaurantId)
    .eq('user_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ removed: true })
}
