// GET /api/campanias — consulta las campañas vigentes de un cliente, para
// que el sistema de facturación las aplique al emitir la factura.
//
// Autenticación (dos modos, igual que /api/cargar-puntos):
//   - Header X-Api-Key: <API_INTEGRATION_KEY>  → integraciones servidor-a-servidor (el modo
//     recomendado acá: el sistema de facturación va a llamar esto en cada factura). Secreto fijo
//     en la env var API_INTEGRATION_KEY, sin expirar.
//   - Authorization: Bearer <access_token> de un usuario admin → uso interactivo/manual. Expira
//     (por defecto a la hora), no apto para una integración recurrente.
//
// Query params (identificar el cliente por tarjeta O por DNI):
//   numero      string  número de tarjeta de 16 dígitos (acepta espacios)
//   dni         string  DNI del cliente (alternativa a numero)
//   local       string  nombre del local donde se factura (opcional)
//   local_id    string  UUID del local (alternativa a local)
//
// Sin local: devuelve TODAS las campañas vigentes del cliente (generales y
// restringidas a cualquier local). Con local: devuelve las generales + las
// restringidas a ESE local únicamente (así no se aplica el descuento de un
// local distinto de donde se está facturando).
//
// Una campaña es vigente entre fecha_desde y fecha_hasta (fecha_hasta null =
// sin vencimiento), y solo se devuelve si el cliente tiene puntos ACUMULADOS
// >= puntos_minimos de esa campaña. Puede haber múltiples campañas
// superpuestas en el tiempo para distintos clientes/grupos.
//
// Respuesta 200:
// {
//   "cliente": "Juan Pérez", "dni": "30123456", "numero_tarjeta": "...",
//   "local": "Sucursal Centro" | null,
//   "campanias": [
//     { "id", "nombre", "descripcion", "descuento_porcentaje", "local",
//       "fecha_desde", "fecha_hasta", "puntos_minimos" }
//   ]
// }
// "local" en cada campaña es el nombre del local o "General".

import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const integrationKey = process.env.API_INTEGRATION_KEY

// Comparación a tiempo constante para no filtrar el secreto por timing.
function apiKeyValida(recibida) {
  if (!integrationKey || !recibida) return false
  const a = Buffer.from(String(recibida))
  const b = Buffer.from(integrationKey)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function getAdmin(req) {
  const apiKey = req.headers['x-api-key']
  if (apiKeyValida(apiKey)) {
    return createClient(url, serviceKey)
  }

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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido. Usá GET.' })
  }

  const admin = await getAdmin(req)
  if (!admin) {
    return res.status(403).json({ error: 'No autorizado (se requiere X-Api-Key válida o un usuario administrador).' })
  }

  const { numero, dni, local, local_id } = req.query || {}

  // Resolver el cliente por número de tarjeta o por DNI
  let cliente = null
  if (numero) {
    const numeroLimpio = String(numero).replace(/\s/g, '')
    const { data: tar } = await admin
      .from('tarjetas')
      .select('numero, clientes(id, nombre, dni)')
      .eq('numero', numeroLimpio)
      .single()
    if (!tar?.clientes) return res.status(404).json({ error: 'No se encontró una tarjeta con ese número.' })
    cliente = { ...tar.clientes, numero_tarjeta: tar.numero }
  } else if (dni) {
    const { data: cli } = await admin
      .from('clientes')
      .select('id, nombre, dni')
      .eq('dni', String(dni).trim())
      .single()
    if (!cli) return res.status(404).json({ error: 'No se encontró un cliente con ese DNI.' })
    const { data: tar } = await admin.from('tarjetas').select('numero').eq('cliente_id', cli.id).single()
    cliente = { ...cli, numero_tarjeta: tar?.numero || null }
  } else {
    return res.status(400).json({ error: 'Indicá el número de tarjeta (numero) o el dni del cliente.' })
  }

  // Resolver el local (opcional): por id o por nombre
  let localId = local_id || null
  let localNombre = null
  if (!localId && local?.trim()) {
    const { data: loc } = await admin
      .from('locales')
      .select('id, nombre')
      .ilike('nombre', local.trim())
      .single()
    if (!loc) return res.status(404).json({ error: `Local no encontrado: "${local}".` })
    localId = loc.id
    localNombre = loc.nombre
  } else if (localId) {
    const { data: loc } = await admin.from('locales').select('nombre').eq('id', localId).single()
    if (!loc) return res.status(404).json({ error: 'local_id no corresponde a ningún local.' })
    localNombre = loc.nombre
  }

  const { data, error } = await admin.rpc('campanias_vigentes_cliente', {
    p_cliente_id: cliente.id,
    p_local_id: localId,
  })
  if (error) return res.status(400).json({ error: error.message })

  const campanias = (data || []).map((c) => ({
    id: c.campania_id,
    nombre: c.nombre,
    descripcion: c.descripcion,
    descuento_porcentaje: Number(c.descuento_porcentaje),
    local: c.local_id ? c.local_nombre : 'General',
    fecha_desde: c.fecha_desde,
    fecha_hasta: c.fecha_hasta,
    puntos_minimos: Number(c.puntos_minimos || 0),
  }))

  return res.status(200).json({
    cliente: cliente.nombre,
    dni: cliente.dni,
    numero_tarjeta: cliente.numero_tarjeta,
    local: localNombre,
    campanias,
  })
}
