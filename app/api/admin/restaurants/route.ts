import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

type PlatformGate =
  | { ok: true; client: SupabaseClient }
  | { ok: false; response: NextResponse }

async function requirePlatformSuperAdmin(request: Request): Promise<PlatformGate> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secretKey) {
    return { ok: false, response: NextResponse.json({ error: 'La gestion admin n’est pas configurée sur le serveur.' }, { status: 503 }) }
  }
  if (!token) return { ok: false, response: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }) }

  const client = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: { user }, error: authError } = await client.auth.getUser(token)
  if (authError || !user) return { ok: false, response: NextResponse.json({ error: 'Session invalide. Reconnectez-vous.' }, { status: 401 }) }

  const { data: profile, error } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (error) return { ok: false, response: NextResponse.json({ error: 'Impossible de vérifier le rôle super admin.' }, { status: 500 }) }
  if (profile?.role !== 'super_admin') {
    return { ok: false, response: NextResponse.json({ error: 'Cette action est réservée au super admin.' }, { status: 403 }) }
  }
  return { ok: true, client }
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

export async function GET(request: Request) {
  const gate = await requirePlatformSuperAdmin(request)
  if (!gate.ok) return gate.response

  const { data: restaurants, error } = await gate.client
    .from('restaurants')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ restaurants: restaurants ?? [] })
}

export async function POST(request: Request) {
  const body = await readBody(request)
  if (!body) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  const gate = await requirePlatformSuperAdmin(request)
  if (!gate.ok) return gate.response

  const name = textValue(body.name)
  const ownerEmail = textValue(body.owner_email).toLowerCase()
  const firstName = textValue(body.owner_first_name)
  const lastName = textValue(body.owner_last_name)
  if (!name || name.length > 80 || !firstName || !lastName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return NextResponse.json({ error: 'Indique un nom de restaurant, le prénom, le nom et un email valide pour son responsable.' }, { status: 400 })
  }

  const { data: existingUsers, error: existingUsersError } = await gate.client.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (existingUsersError) return NextResponse.json({ error: existingUsersError.message }, { status: 500 })
  if (existingUsers.users.some(user => user.email?.toLowerCase() === ownerEmail)) {
    return NextResponse.json({ error: 'Cette adresse email a déjà un compte. Pour le moment, utilise une nouvelle adresse pour le responsable de ce restaurant.' }, { status: 409 })
  }

  const slugBase = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'restaurant'
  const slug = `${slugBase}-${crypto.randomUUID().slice(0, 8)}`
  const { data: restaurant, error: restaurantError } = await gate.client
    .from('restaurants')
    .insert({ name, slug })
    .select('id, name, created_at')
    .single()
  if (restaurantError) return NextResponse.json({ error: restaurantError.message }, { status: 500 })

  const { data: invitation, error: invitationError } = await gate.client.auth.admin.inviteUserByEmail(ownerEmail, {
    data: { first_name: firstName, last_name: lastName },
  })
  if (invitationError) {
    await gate.client.from('restaurants').delete().eq('id', restaurant.id)
    return NextResponse.json({ error: `Le restaurant n’a pas été créé : ${invitationError.message}` }, { status: 400 })
  }

  const { error: membershipError } = await gate.client.from('restaurant_members').insert({
    restaurant_id: restaurant.id,
    user_id: invitation.user.id,
    role: 'owner',
  })
  if (membershipError) {
    await gate.client.auth.admin.deleteUser(invitation.user.id)
    await gate.client.from('restaurants').delete().eq('id', restaurant.id)
    return NextResponse.json({ error: `La configuration du responsable a échoué : ${membershipError.message}` }, { status: 500 })
  }

  return NextResponse.json({ restaurant, owner_email: ownerEmail, invited: true }, { status: 201 })
}
