// POST /api/cargar-puntos — carga puntos a una tarjeta desde un sistema externo.
// Requiere Authorization: Bearer <access_token> de un usuario admin.
//
// Body JSON (identificar la tarjeta por número O por DNI del cliente):
//   numero          string  número de tarjeta de 16 dígitos (acepta espacios)
//   dni             string  DNI del cliente (alternativa a numero)
//   factura_pesos*  number  importe de la factura (> 0)
//   factura_numero  string  n° de factura (opcional)
//   comercio*       string  nombre del comercio de la factura (obligatorio); también acepta comercio_id (UUID)
//
// Respuesta 201: { numero_tarjeta, cliente, factura_pesos, pesos_por_punto,
//                  puntos_otorgados, puntos_totales }

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
  return { admin, callerEmail: user.email }
}

export default async function handler(req, res) {
  if (!url || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' })
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usá POST.' })
  }

  const ctx = await getAdmin(req)
  if (!ctx) return res.status(403).json({ error: 'No autorizado (se requiere un usuario administrador).' })
  const { admin, callerEmail } = ctx

  const { numero, dni, factura_pesos, factura_numero, comercio, comercio_id } = req.body || {}
  const pesos = Number(factura_pesos)
  if (!pesos || pesos <= 0) {
    return res.status(400).json({ error: 'factura_pesos debe ser un número mayor a cero.' })
  }

  // Resolver el comercio (por id o por nombre). Opcional.
  let comercioId = comercio_id || null
  if (!comercioId && comercio?.trim()) {
    const { data: com } = await admin
      .from('comercios')
      .select('id')
      .ilike('nombre', comercio.trim())
      .single()
    if (!com) return res.status(404).json({ error: `Comercio no encontrado: "${comercio}".` })
    comercioId = com.id
  }
  if (!comercioId) {
    return res.status(400).json({ error: 'Indicá el comercio de la factura (comercio o comercio_id).' })
  }

  // Resolver el número de tarjeta
  let numeroTarjeta = numero ? String(numero).replace(/\s/g, '') : null
  if (!numeroTarjeta && dni) {
    const { data: cli } = await admin.from('clientes').select('id').eq('dni', String(dni).trim()).single()
    if (!cli) return res.status(404).json({ error: 'No se encontró un cliente con ese DNI.' })
    const { data: tar } = await admin.from('tarjetas').select('numero').eq('cliente_id', cli.id).single()
    if (!tar) return res.status(404).json({ error: 'El cliente no tiene una tarjeta emitida.' })
    numeroTarjeta = tar.numero
  }
  if (!numeroTarjeta) {
    return res.status(400).json({ error: 'Indicá el número de tarjeta (numero) o el dni del cliente.' })
  }

  const { data, error } = await admin.rpc('cargar_puntos', {
    p_numero: numeroTarjeta,
    p_factura_pesos: pesos,
    p_factura_numero: factura_numero ? String(factura_numero).trim() : null,
    p_origen: 'api',
    p_usuario_email: callerEmail,
    p_comercio_id: comercioId,
  })

  if (error) {
    const notFound = /no encontrada/i.test(error.message)
    return res.status(notFound ? 404 : 400).json({ error: error.message })
  }

  return res.status(201).json(data)
}
