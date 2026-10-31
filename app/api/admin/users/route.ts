import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

type AdminGate =
  | { ok: true; client: SupabaseClient; user: User }
  | { ok: false; response: NextResponse }

async function requireAdmin(request: Request): Promise<AdminGate> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secretKey) {
    return { ok: false, response: NextResponse.json({ error: 'La gestion admin n’est pas configurée sur le serveur.' }, { status: 503 }) }
  }
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }) }
  }

  const client = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: { user }, error: authError } = await client.auth.getUser(token)
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Session invalide. Connectez-vous de nouveau.' }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) {
    return { ok: false, response: NextResponse.json({ error: 'Impossible de vérifier les droits administrateur.' }, { status: 500 }) }
  }
  if (profile?.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Accès réservé aux administrateurs.' }, { status: 403 }) }
  }
  return { ok: true, client, user }
}

function metadataName(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export async function GET(request: Request) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  const { data: userPage, error: usersError } = await gate.client.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 })
  const ids = userPage.users.map(user => user.id)
  const { data: profiles, error: profilesError } = ids.length
    ? await gate.client.from('profiles').select('id, first_name, last_name, role').in('id', ids)
    : { data: [], error: null }
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 })

  const profileById = new Map((profiles ?? []).map(profile => [profile.id, profile]))
  const users = userPage.users.map(user => {
    const profile = profileById.get(user.id)
    return {
      id: user.id,
      email: user.email ?? '',
      first_name: profile?.first_name ?? metadataName(user.user_metadata?.first_name),
      last_name: profile?.last_name ?? metadataName(user.user_metadata?.last_name),
      role: profile?.role ?? 'member',
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
    }
  })
  return NextResponse.json({ users })
}

export async function POST(request: Request) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  let body: { email?: string; first_name?: string; last_name?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const email = body.email?.trim().toLowerCase()
  const firstName = body.first_name?.trim()
  const lastName = body.last_name?.trim()
  if (!email || !firstName || !lastName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Indiquez un email valide, un prénom et un nom.' }, { status: 400 })
  }

  const { data, error } = await gate.client.auth.admin.inviteUserByEmail(email, {
    data: { first_name: firstName, last_name: lastName },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ invited: true, id: data.user.id }, { status: 201 })
}

export async function PATCH(request: Request) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  let body: { id?: string; first_name?: string; last_name?: string; role?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const id = body.id?.trim()
  const firstName = body.first_name?.trim()
  const lastName = body.last_name?.trim()
  const role = body.role
  if (!id || !firstName || !lastName || (role !== 'admin' && role !== 'member')) {
    return NextResponse.json({ error: 'Informations de membre incomplètes.' }, { status: 400 })
  }
  if (id === gate.user.id && role !== 'admin') {
    return NextResponse.json({ error: 'Vous ne pouvez pas retirer votre propre accès administrateur.' }, { status: 400 })
  }
  if (role === 'member') {
    const { count, error: countError } = await gate.client
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
    if ((count ?? 0) <= 1) {
      const { data: target } = await gate.client.from('profiles').select('role').eq('id', id).maybeSingle()
      if (target?.role === 'admin') {
        return NextResponse.json({ error: 'Il doit rester au moins un administrateur.' }, { status: 400 })
      }
    }
  }

  const { error: metadataError } = await gate.client.auth.admin.updateUserById(id, {
    user_metadata: { first_name: firstName, last_name: lastName },
  })
  if (metadataError) return NextResponse.json({ error: metadataError.message }, { status: 400 })

  const { error: updateError } = await gate.client
    .from('profiles')
    .update({ first_name: firstName, last_name: lastName, role })
    .eq('id', id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ updated: true })
}
