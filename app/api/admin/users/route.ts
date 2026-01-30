import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

// Verify the caller is a superadmin
async function verifySuperAdmin() {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const serverSupabase = getServerSupabase()
  const { data: profile } = await serverSupabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'superadmin'
}

// GET - List all users with their profiles, permissions, and client assignments
export async function GET() {
  if (!(await verifySuperAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const serverSupabase = getServerSupabase()

  const [profilesRes, permissionsRes, clientsRes, userClientsRes] = await Promise.all([
    serverSupabase.from('user_profiles').select('*').order('created_at', { ascending: true }),
    serverSupabase.from('user_permissions').select('*'),
    serverSupabase.from('clients').select('id, name'),
    serverSupabase.from('user_clients').select('*'),
  ])

  return NextResponse.json({
    users: profilesRes.data || [],
    permissions: permissionsRes.data || [],
    clients: clientsRes.data || [],
    userClients: userClientsRes.data || [],
  })
}

// POST - Create a new user
export async function POST(request: Request) {
  if (!(await verifySuperAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json()
  const { email, password, display_name, role } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const serverSupabase = getServerSupabase()

  // Create the auth user (this triggers the handle_new_user trigger which creates the profile)
  const { data: authData, error: authError } = await serverSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  // Update the profile with display_name and role (trigger created it with defaults)
  if (authData.user) {
    await serverSupabase
      .from('user_profiles')
      .update({
        display_name: display_name || null,
        role: role || 'viewer',
      })
      .eq('id', authData.user.id)
  }

  return NextResponse.json({ user: authData.user })
}

// PUT - Update a user's profile, permissions, or client assignments
export async function PUT(request: Request) {
  if (!(await verifySuperAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json()
  const { userId, action, ...data } = body

  if (!userId || !action) {
    return NextResponse.json({ error: 'userId and action are required' }, { status: 400 })
  }

  const serverSupabase = getServerSupabase()

  switch (action) {
    case 'update_profile': {
      const { role, display_name, is_active } = data
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (role !== undefined) updates.role = role
      if (display_name !== undefined) updates.display_name = display_name
      if (is_active !== undefined) updates.is_active = is_active

      const { error } = await serverSupabase
        .from('user_profiles')
        .update(updates)
        .eq('id', userId)

      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    case 'set_permissions': {
      const { permissions } = data as { permissions: { feature: string; access_level: string }[] }

      // Delete existing permissions for this user
      await serverSupabase
        .from('user_permissions')
        .delete()
        .eq('user_id', userId)

      // Insert new permissions (only non-default ones)
      if (permissions && permissions.length > 0) {
        const rows = permissions
          .filter((p) => p.access_level !== 'none')
          .map((p) => ({
            user_id: userId,
            feature: p.feature,
            access_level: p.access_level,
          }))

        if (rows.length > 0) {
          const { error } = await serverSupabase
            .from('user_permissions')
            .insert(rows)

          if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        }
      }

      return NextResponse.json({ success: true })
    }

    case 'set_clients': {
      const { clientIds } = data as { clientIds: string[] }

      // Delete existing client assignments
      await serverSupabase
        .from('user_clients')
        .delete()
        .eq('user_id', userId)

      // Insert new assignments
      if (clientIds && clientIds.length > 0) {
        const rows = clientIds.map((clientId: string) => ({
          user_id: userId,
          client_id: clientId,
        }))

        const { error } = await serverSupabase
          .from('user_clients')
          .insert(rows)

        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      }

      return NextResponse.json({ success: true })
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}
