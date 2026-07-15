// POST /api/portal-auth — autenticación del portal de clientes.
// Cuentas en la tabla usuarios_web (SIN Supabase Auth). Solo pueden operar
// clientes activos con el tilde "Cliente Web" habilitado.
//
// Body JSON: { action, ...campos }
//   registro          { dni, email, password }        → 201 { token, nombre }
//   login             { email, password }             → 200 { token, nombre }
//   olvido            { email }                       → 200 { ok } (manda mail por Brevo)
//   reset             { token, password }             → 200 { ok }
//   cambiar_password  { actual, nueva } + Bearer      → 200 { ok }

import {
  adminClient,
  hashPassword,
  verifyPassword,
  firmarToken,
  getSesionPortal,
  sha256,
  enviarEmailBrevo,
} from './_portal.js'
import crypto from 'node:crypto'

const MIN_PASSWORD = 8

function validarPassword(pass, res) {
  if (!pass || String(pass).length < MIN_PASSWORD) {
    res.status(400).json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` })
    return false
  }
  return true
}

export default async function handler(req, res) {
  const admin = adminClient()
  if (!admin) {
    return res.status(500).json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' })
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usá POST.' })
  }

  const { action } = req.body || {}
  try {
    if (action === 'registro') return await registro(req, res, admin)
    if (action === 'login') return await login(req, res, admin)
    if (action === 'olvido') return await olvido(req, res, admin)
    if (action === 'reset') return await reset(req, res, admin)
    if (action === 'cambiar_password') return await cambiarPassword(req, res, admin)
    return res.status(400).json({ error: 'Acción desconocida.' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

// El cliente crea su propia cuenta: DNI + email deben coincidir con la ficha
// cargada por el comercio, y tener habilitado el acceso web.
async function registro(req, res, admin) {
  const { dni, email, password } = req.body || {}
  if (!/^[1-9][0-9]{6,7}$/.test(String(dni || '').trim())) {
    return res.status(400).json({ error: 'Ingresá un DNI válido (sin puntos).' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) {
    return res.status(400).json({ error: 'Ingresá una dirección de email válida.' })
  }
  if (!validarPassword(password, res)) return

  const { data: cliente } = await admin
    .from('clientes')
    .select('id, nombre, email, activo, cliente_web')
    .eq('dni', String(dni).trim())
    .single()

  if (!cliente) {
    return res.status(404).json({ error: 'No encontramos un cliente con ese DNI. Consultá en el comercio.' })
  }
  if (!cliente.activo) {
    return res.status(403).json({ error: 'Tu cuenta de cliente está dada de baja. Consultá en el comercio.' })
  }
  if (!cliente.cliente_web) {
    return res.status(403).json({ error: 'El acceso web no está habilitado para tu cuenta. Pedilo en el comercio.' })
  }
  const emailNorm = String(email).trim().toLowerCase()
  if ((cliente.email || '').trim().toLowerCase() !== emailNorm) {
    return res.status(400).json({ error: 'El email no coincide con el registrado para ese DNI.' })
  }

  const { data: cuenta, error } = await admin
    .from('usuarios_web')
    .insert({ cliente_id: cliente.id, email: emailNorm, password_hash: hashPassword(password) })
    .select('id')
    .single()

  if (error) {
    const dup = error.code === '23505' || error.message.includes('duplicate')
    return res.status(409).json({
      error: dup
        ? 'Ya existe una cuenta para este cliente. Si no recordás la contraseña, usá "Olvidé mi contraseña".'
        : error.message,
    })
  }

  return res.status(201).json({ token: firmarToken({ usuario_web_id: cuenta.id }), nombre: cliente.nombre })
}

async function login(req, res, admin) {
  const { email, password } = req.body || {}
  const emailNorm = String(email || '').trim().toLowerCase()

  const { data: uw } = await admin
    .from('usuarios_web')
    .select('id, password_hash, activo, cliente:clientes (nombre, activo, cliente_web)')
    .eq('email', emailNorm)
    .single()

  if (!uw || !verifyPassword(String(password || ''), uw.password_hash)) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos.' })
  }
  if (!uw.activo) {
    return res.status(403).json({ error: 'Tu cuenta web está deshabilitada. Consultá en el comercio.' })
  }
  if (!uw.cliente?.activo || !uw.cliente.cliente_web) {
    return res.status(403).json({ error: 'El acceso web no está habilitado para tu cuenta. Consultá en el comercio.' })
  }

  await admin.from('usuarios_web').update({ ultimo_login: new Date().toISOString() }).eq('id', uw.id)

  return res.status(200).json({ token: firmarToken({ usuario_web_id: uw.id }), nombre: uw.cliente.nombre })
}

// Siempre responde ok (exista o no la cuenta) para no revelar emails registrados.
async function olvido(req, res, admin) {
  const emailNorm = String(req.body?.email || '').trim().toLowerCase()
  if (!emailNorm) return res.status(400).json({ error: 'Ingresá tu email.' })

  const { data: uw } = await admin
    .from('usuarios_web')
    .select('id, email, activo, cliente:clientes (nombre, activo, cliente_web)')
    .eq('email', emailNorm)
    .single()

  if (uw?.activo && uw.cliente?.activo && uw.cliente.cliente_web) {
    const token = crypto.randomBytes(32).toString('hex')
    const expira = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hora
    await admin
      .from('usuarios_web')
      .update({ reset_token_hash: sha256(token), reset_token_expira: expira })
      .eq('id', uw.id)

    // Base del link: PORTAL_URL > Origin del navegador > host del request (Vercel).
    // Siempre debe quedar una URL absoluta: un href relativo en un mail no abre nada.
    const host = req.headers['x-forwarded-host'] || req.headers.host
    const base = (process.env.PORTAL_URL || req.headers.origin || (host ? `https://${host}` : ''))
      .trim()
      .replace(/\/$/, '')
    if (!base) throw new Error('No se pudo determinar la URL del portal: configurá PORTAL_URL en el servidor.')
    const link = `${base}/portal/login?reset=${token}`
    await enviarEmailBrevo({
      to: uw.email,
      subject: 'Recuperá tu contraseña — Programa de Puntos',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#5b21b6">Programa de Puntos</h2>
          <p>Hola ${uw.cliente.nombre},</p>
          <p>Recibimos un pedido para restablecer tu contraseña del portal de clientes.
             Hacé clic en el botón para elegir una nueva (el enlace vence en 1 hora):</p>
          <p style="text-align:center;margin:28px 0">
            <a href="${link}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold">
              Restablecer contraseña
            </a>
          </p>
          <p style="color:#64748b;font-size:13px">Si no fuiste vos, ignorá este correo: tu contraseña sigue siendo la misma.</p>
        </div>`,
    })
  }

  return res.status(200).json({ ok: true })
}

async function reset(req, res, admin) {
  const { token, password } = req.body || {}
  if (!token) return res.status(400).json({ error: 'Falta el token de recupero.' })
  if (!validarPassword(password, res)) return

  const { data: uw } = await admin
    .from('usuarios_web')
    .select('id, reset_token_expira')
    .eq('reset_token_hash', sha256(String(token)))
    .single()

  if (!uw || !uw.reset_token_expira || new Date(uw.reset_token_expira) < new Date()) {
    return res.status(400).json({ error: 'El enlace de recupero es inválido o venció. Pedí uno nuevo.' })
  }

  await admin
    .from('usuarios_web')
    .update({ password_hash: hashPassword(password), reset_token_hash: null, reset_token_expira: null })
    .eq('id', uw.id)

  return res.status(200).json({ ok: true })
}

async function cambiarPassword(req, res, admin) {
  const sesion = await getSesionPortal(req)
  if (!sesion) return res.status(401).json({ error: 'Sesión inválida o vencida. Volvé a iniciar sesión.' })

  const { actual, nueva } = req.body || {}
  if (!validarPassword(nueva, res)) return

  const { data: uw } = await admin
    .from('usuarios_web')
    .select('id, password_hash')
    .eq('id', sesion.usuarioWeb.id)
    .single()

  if (!uw || !verifyPassword(String(actual || ''), uw.password_hash)) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta.' })
  }

  await admin.from('usuarios_web').update({ password_hash: hashPassword(nueva) }).eq('id', uw.id)
  return res.status(200).json({ ok: true })
}
