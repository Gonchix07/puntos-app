// Helpers compartidos del portal de clientes.
// El prefijo "_" hace que Vercel NO lo publique como endpoint.
//
// Autenticación propia (tabla usuarios_web, sin Supabase Auth):
//   - Contraseñas: scrypt (crypto nativo de Node, sin dependencias extra).
//   - Sesión: token firmado con HMAC-SHA256 (estilo JWT), 7 días.
//   - Recupero: token aleatorio enviado por mail (Brevo); en DB solo se
//     guarda su hash SHA-256.
//
// Variables de entorno (además de las de Supabase):
//   PORTAL_TOKEN_SECRET  secreto para firmar sesiones (si falta, usa la service key)
//   BREVO_API_KEY        API key de Brevo (transaccional)
//   BREVO_FROM_EMAIL     remitente verificado en Brevo
//   BREVO_FROM_NAME      nombre del remitente (opcional)
//   PORTAL_URL           URL pública de la app, para armar el link de recupero

import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const SECRET = process.env.PORTAL_TOKEN_SECRET || serviceKey || ''

export function adminClient() {
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey)
}

// ---------- Contraseñas (scrypt) ----------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password, stored) {
  const [algo, salt, hash] = String(stored || '').split('$')
  if (algo !== 'scrypt' || !salt || !hash) return false
  const calc = crypto.scryptSync(password, salt, 64)
  const orig = Buffer.from(hash, 'hex')
  return calc.length === orig.length && crypto.timingSafeEqual(calc, orig)
}

export function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex')
}

// ---------- Token de sesión (HMAC-SHA256) ----------
export function firmarToken(payload, dias = 7) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + dias * 86400000 })).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verificarToken(token) {
  const [body, sig] = String(token || '').split('.')
  if (!body || !sig) return null
  const esperada = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(esperada)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (!payload.exp || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function tokenDeRequest(req) {
  return (req.headers.authorization || '').replace('Bearer ', '').trim()
}

// Valida el token del portal contra la DB. Devuelve { admin, usuarioWeb, cliente } o null.
// Corta la sesión si la cuenta web, el cliente o el tilde "Cliente Web" se desactivaron.
export async function getSesionPortal(req) {
  const payload = verificarToken(tokenDeRequest(req))
  if (!payload?.usuario_web_id) return null
  const admin = adminClient()
  if (!admin) return null
  const { data: uw } = await admin
    .from('usuarios_web')
    .select('id, cliente_id, email, activo, cliente:clientes (id, nombre, dni, email, telefono, activo, cliente_web)')
    .eq('id', payload.usuario_web_id)
    .single()
  if (!uw?.activo) return null
  const cliente = uw.cliente
  if (!cliente?.activo || !cliente.cliente_web) return null
  return { admin, usuarioWeb: uw, cliente }
}

// ---------- Email transaccional (Brevo) ----------
export async function enviarEmailBrevo({ to, subject, html }) {
  const apiKey = process.env.BREVO_API_KEY
  const fromEmail = process.env.BREVO_FROM_EMAIL
  if (!apiKey || !fromEmail) {
    throw new Error('Falta configurar BREVO_API_KEY / BREVO_FROM_EMAIL en el servidor.')
  }
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: fromEmail, name: process.env.BREVO_FROM_NAME || 'Programa de Puntos' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  })
  if (!r.ok) {
    const detalle = await r.text().catch(() => '')
    throw new Error(`Brevo respondió ${r.status}: ${detalle}`)
  }
}
