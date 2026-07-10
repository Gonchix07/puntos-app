// POST /api/clientes — crea un cliente desde un sistema externo.
// Al crearse, el trigger de la base emite automáticamente su tarjeta de puntos.
// Requiere Authorization: Bearer <access_token> de un usuario admin.
//
// Body JSON:
//   nombre*    string
//   dni*       string
//   email      string (opcional, formato válido)
//   telefono   string (opcional)
//
// Respuesta 201: { id, nombre, dni, email, telefono, tarjeta: { numero, puntos } }

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usá POST.' })
  }

  const admin = await getAdmin(req)
  if (!admin) return res.status(403).json({ error: 'No autorizado (se requiere un usuario administrador).' })

  const { nombre, dni, email, telefono } = req.body || {}
  if (!nombre?.trim()) return res.status(400).json({ error: 'El campo nombre es obligatorio.' })
  if (!dni?.trim()) return res.status(400).json({ error: 'El campo dni es obligatorio.' })
  if (email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'El formato del email no es válido.' })
  }

  const payload = {
    nombre: nombre.trim(),
    dni: dni.trim(),
    email: email?.trim() || null,
    telefono: telefono?.trim() || null,
  }

  const { data, error } = await admin.from('clientes').insert(payload).select().single()
  if (error) {
    const msg = error.message.includes('dni') ? 'Ya existe un cliente con ese DNI.' : error.message
    return res.status(409).json({ error: msg })
  }

  // El trigger ya emitió la tarjeta: la buscamos para devolverla.
  const { data: tarjeta } = await admin
    .from('tarjetas')
    .select('numero, puntos')
    .eq('cliente_id', data.id)
    .single()

  return res.status(201).json({ ...data, tarjeta: tarjeta || null })
}
