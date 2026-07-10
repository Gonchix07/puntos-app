// ABM de usuarios (Supabase Auth) con service_role.
//   POST   -> crear   { email, password, role }
//   PATCH  -> modificar { userId, email?, password?, role }
//   DELETE -> eliminar { userId }
// Requiere header Authorization: Bearer <access_token> de un usuario admin.

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

async function getAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  const anon = createClient(url, anonKey)
  const { data: { user } } = await anon.auth.getUser(token)
  if (!user) return null
  const admin = createClient(url, serviceKey)
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (prof?.role !== 'admin') return null
  return admin
}

export default async function handler(req, res) {
  if (!url || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' })
  }

  const admin = await getAdmin(req)
  if (!admin) return res.status(403).json({ error: 'No autorizado (se requiere un usuario administrador).' })

  try {
    if (req.method === 'POST') {
      const { email, password, role } = req.body || {}
      if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son obligatorios.' })
      if (!['admin', 'operador'].includes(role)) return res.status(400).json({ error: 'Rol inválido.' })
      const { data, error } = await admin.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: { role },
      })
      if (error) return res.status(400).json({ error: error.message })
      // Aseguramos el rol en profiles (el trigger crea el perfil con el rol del metadata)
      await admin.from('profiles').update({ role }).eq('id', data.user.id)
      return res.status(201).json({ id: data.user.id, email: data.user.email, role })
    }

    if (req.method === 'PATCH') {
      const { userId, email, password, role } = req.body || {}
      if (!userId) return res.status(400).json({ error: 'Falta userId.' })
      const attrs = {}
      if (email) attrs.email = email.trim()
      if (password) attrs.password = password
      if (Object.keys(attrs).length) {
        const { error } = await admin.auth.admin.updateUserById(userId, attrs)
        if (error) return res.status(400).json({ error: error.message })
      }
      if (role) {
        if (!['admin', 'operador'].includes(role)) return res.status(400).json({ error: 'Rol inválido.' })
        await admin.from('profiles').update({ role, email: email?.trim() }).eq('id', userId)
      }
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const { userId } = req.body || {}
      if (!userId) return res.status(400).json({ error: 'Falta userId.' })
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Método no permitido.' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
