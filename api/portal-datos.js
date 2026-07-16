// /api/portal-datos — datos del portal de clientes.
// Requiere Authorization: Bearer <token del portal> (emitido por /api/portal-auth).
//
//   GET  → { cliente, tarjeta, saldos, premios, solicitudes, cargas, canjes }
//   POST { action: 'canjear', premio_id } → crea la solicitud de canje (RPC crear_solicitud)

import { getSesionPortal } from './_portal.js'

export default async function handler(req, res) {
  const sesion = await getSesionPortal(req)
  if (!sesion) {
    return res.status(401).json({ error: 'Sesión inválida o vencida. Volvé a iniciar sesión.' })
  }
  const { admin, cliente, usuarioWeb } = sesion

  if (req.method === 'GET') {
    const [tarjetaQ, saldosQ, premiosQ, solicitudesQ, cargasQ, canjesQ, comerciosQ] = await Promise.all([
      admin
        .from('tarjetas')
        .select('numero, puntos, puntos_remanentes, activa')
        .eq('cliente_id', cliente.id)
        .single(),
      admin.rpc('saldos_cliente', { p_cliente_id: cliente.id }),
      admin
        .from('premios')
        .select('id, titulo, descripcion, foto_url, puntos_necesarios, stock, comercio_id, comercio:comercios (nombre, logo_url)')
        .eq('activo', true)
        .gt('stock', 0)
        .order('puntos_necesarios'),
      admin
        .from('solicitudes')
        .select('id, premio_titulo, comercio_nombre, puntos, estado, created_at, updated_at')
        .eq('cliente_id', cliente.id)
        .order('created_at', { ascending: false }),
      admin
        .from('cargas')
        .select('created_at, comercio_id, comercio_nombre, factura_numero, factura_pesos, puntos')
        .eq('cliente_id', cliente.id)
        .order('created_at', { ascending: false }),
      admin
        .from('canjes')
        .select('created_at, premio_titulo, comercio_id, comercio_nombre, puntos')
        .eq('cliente_id', cliente.id)
        .order('created_at', { ascending: false }),
      admin.from('comercios').select('id, nombre, logo_url').order('nombre'),
    ])

    return res.status(200).json({
      cliente: {
        nombre: cliente.nombre,
        dni: cliente.dni,
        email: usuarioWeb.email,
        telefono: cliente.telefono,
      },
      tarjeta: tarjetaQ.data || null,
      saldos: saldosQ.data || [],
      premios: premiosQ.data || [],
      solicitudes: solicitudesQ.data || [],
      cargas: cargasQ.data || [],
      canjes: canjesQ.data || [],
      comercios: comerciosQ.data || [],
    })
  }

  if (req.method === 'POST') {
    const { action, premio_id } = req.body || {}
    if (action !== 'canjear') return res.status(400).json({ error: 'Acción desconocida.' })
    if (!premio_id) return res.status(400).json({ error: 'Falta el premio a canjear.' })

    const { data, error } = await admin.rpc('crear_solicitud', {
      p_cliente_id: cliente.id,
      p_premio_id: premio_id,
      p_usuario_email: usuarioWeb.email,
    })
    if (error) return res.status(400).json({ error: error.message })
    return res.status(201).json(data)
  }

  return res.status(405).json({ error: 'Método no permitido.' })
}
