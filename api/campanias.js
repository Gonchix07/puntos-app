// /api/campanias — campañas de % de descuento, para el sistema de facturación.
//
// Autenticación (dos modos, igual que /api/cargar-puntos):
//   - Header X-Api-Key: <API_INTEGRATION_KEY>  → integraciones servidor-a-servidor (el modo
//     recomendado acá: el sistema de facturación va a llamar esto en cada factura). Secreto fijo
//     en la env var API_INTEGRATION_KEY, sin expirar.
//   - Authorization: Bearer <access_token> de un usuario admin → uso interactivo/manual. Expira
//     (por defecto a la hora), no apto para una integración recurrente.
//
// GET — consulta las campañas vigentes de un cliente en este momento.
//   Query params (identificar el cliente por tarjeta O por DNI):
//     numero      string  número de tarjeta de 16 dígitos (acepta espacios)
//     dni         string  DNI del cliente (alternativa a numero)
//     local       string  nombre del local donde se factura (opcional)
//     local_id    string  UUID del local (alternativa a local)
//   Sin local: devuelve TODAS las campañas vigentes del cliente (generales y
//   restringidas a cualquier local). Con local: devuelve las generales + las
//   restringidas a ESE local únicamente.
//
//   Una campaña es vigente entre fecha_desde y fecha_hasta (fecha_hasta null =
//   sin vencimiento), solo aplica los días de dias_semana (null = todos),
//   solo si el cliente tiene puntos ACUMULADOS >= puntos_minimos, y deja de
//   listarse si ya se usó dentro del período de su periodicidad (ilimitado /
//   diaria / semanal / mensual) — ver POST más abajo.
//
//   Respuesta 200:
//   {
//     "cliente": "Juan Pérez", "dni": "30123456", "numero_tarjeta": "...",
//     "local": "Sucursal Centro" | null,
//     "campanias": [
//       { "id", "nombre", "descripcion", "descuento_porcentaje", "local",
//         "fecha_desde", "fecha_hasta", "puntos_minimos", "dias_semana",
//         "periodicidad" }
//     ]
//   }
//   "local" en cada campaña es el nombre del local o "General". "dias_semana"
//   es un array de 0(domingo)-6(sábado) o null si aplica todos los días.
//
// POST — registra que el sistema de facturación aplicó el descuento de una
// campaña en una venta (para que la periodicidad se cumpla de verdad).
//   Body JSON:
//     campania_id*  string  UUID de la campaña (viene del GET anterior)
//     numero | dni  string  identifica al cliente (igual que en GET)
//     local | local_id  string  local donde se facturó (opcional)
//   Revalida toda la elegibilidad (vigencia, día, mínimo, destinatario y
//   periodicidad) antes de registrar — si ya no es válida, devuelve 400.
//   Respuesta 201: { "uso_id", "campania", "usado_en" }

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

// Resuelve el cliente por número de tarjeta o por DNI. Devuelve
// { cliente } o { error, status }.
async function resolverCliente(admin, { numero, dni }) {
  if (numero) {
    const numeroLimpio = String(numero).replace(/\s/g, '')
    const { data: tar } = await admin
      .from('tarjetas')
      .select('numero, clientes(id, nombre, dni)')
      .eq('numero', numeroLimpio)
      .single()
    if (!tar?.clientes) return { error: 'No se encontró una tarjeta con ese número.', status: 404 }
    return { cliente: { ...tar.clientes, numero_tarjeta: tar.numero } }
  }
  if (dni) {
    const { data: cli } = await admin
      .from('clientes')
      .select('id, nombre, dni')
      .eq('dni', String(dni).trim())
      .single()
    if (!cli) return { error: 'No se encontró un cliente con ese DNI.', status: 404 }
    const { data: tar } = await admin.from('tarjetas').select('numero').eq('cliente_id', cli.id).single()
    return { cliente: { ...cli, numero_tarjeta: tar?.numero || null } }
  }
  return { error: 'Indicá el número de tarjeta (numero) o el dni del cliente.', status: 400 }
}

// Resuelve el local (opcional) por id o por nombre. Devuelve
// { localId, localNombre } o { error, status }.
async function resolverLocal(admin, { local, local_id }) {
  if (!local_id && !local?.trim()) return { localId: null, localNombre: null }
  if (local_id) {
    const { data: loc } = await admin.from('locales').select('nombre').eq('id', local_id).single()
    if (!loc) return { error: 'local_id no corresponde a ningún local.', status: 404 }
    return { localId: local_id, localNombre: loc.nombre }
  }
  const { data: loc } = await admin.from('locales').select('id, nombre').ilike('nombre', local.trim()).single()
  if (!loc) return { error: `Local no encontrado: "${local}".`, status: 404 }
  return { localId: loc.id, localNombre: loc.nombre }
}

function mapCampania(c) {
  return {
    id: c.campania_id,
    nombre: c.nombre,
    descripcion: c.descripcion,
    descuento_porcentaje: Number(c.descuento_porcentaje),
    local: c.local_id ? c.local_nombre : 'General',
    fecha_desde: c.fecha_desde,
    fecha_hasta: c.fecha_hasta,
    puntos_minimos: Number(c.puntos_minimos || 0),
    dias_semana: c.dias_semana,
    periodicidad: c.periodicidad,
  }
}

export default async function handler(req, res) {
  if (!url || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' })
  }

  const admin = await getAdmin(req)
  if (!admin) {
    return res.status(403).json({ error: 'No autorizado (se requiere X-Api-Key válida o un usuario administrador).' })
  }

  if (req.method === 'GET') {
    const { numero, dni, local, local_id } = req.query || {}

    const rc = await resolverCliente(admin, { numero, dni })
    if (rc.error) return res.status(rc.status).json({ error: rc.error })
    const { cliente } = rc

    const rl = await resolverLocal(admin, { local, local_id })
    if (rl.error) return res.status(rl.status).json({ error: rl.error })
    const { localId, localNombre } = rl

    const { data, error } = await admin.rpc('campanias_vigentes_cliente', {
      p_cliente_id: cliente.id,
      p_local_id: localId,
    })
    if (error) return res.status(400).json({ error: error.message })

    return res.status(200).json({
      cliente: cliente.nombre,
      dni: cliente.dni,
      numero_tarjeta: cliente.numero_tarjeta,
      local: localNombre,
      campanias: (data || []).map(mapCampania),
    })
  }

  if (req.method === 'POST') {
    const { campania_id, numero, dni, local, local_id } = req.body || {}
    if (!campania_id) return res.status(400).json({ error: 'Falta campania_id.' })

    const rc = await resolverCliente(admin, { numero, dni })
    if (rc.error) return res.status(rc.status).json({ error: rc.error })
    const { cliente } = rc

    const rl = await resolverLocal(admin, { local, local_id })
    if (rl.error) return res.status(rl.status).json({ error: rl.error })
    const { localId } = rl

    const { data, error } = await admin.rpc('registrar_uso_campania', {
      p_campania_id: campania_id,
      p_cliente_id: cliente.id,
      p_local_id: localId,
      p_usuario_email: 'api-integracion',
    })
    if (error) {
      const notFound = /no encontrada/i.test(error.message)
      return res.status(notFound ? 404 : 400).json({ error: error.message })
    }

    return res.status(201).json(data)
  }

  return res.status(405).json({ error: 'Método no permitido. Usá GET o POST.' })
}
