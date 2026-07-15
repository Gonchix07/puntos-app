import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button, Card, Input } from '../../components/ui'

// Mi cuenta: datos personales (solo lectura) + cambio de contraseña.
export default function PortalCuenta() {
  const { datos, api } = useOutletContext()
  const [form, setForm] = useState({ actual: '', nueva: '', nueva2: '' })
  const [msg, setMsg] = useState(null)
  const [guardando, setGuardando] = useState(false)

  if (!datos) return <p className="text-slate-500">Cargando…</p>

  const { cliente } = datos

  async function cambiarPassword(e) {
    e.preventDefault()
    setMsg(null)
    if (form.nueva.length < 8) {
      setMsg({ tipo: 'error', texto: 'La nueva contraseña debe tener al menos 8 caracteres.' })
      return
    }
    if (form.nueva !== form.nueva2) {
      setMsg({ tipo: 'error', texto: 'Las contraseñas nuevas no coinciden.' })
      return
    }
    setGuardando(true)
    try {
      await api('/api/portal-auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'cambiar_password', actual: form.actual, nueva: form.nueva }),
      })
      setMsg({ tipo: 'ok', texto: 'Contraseña actualizada correctamente.' })
      setForm({ actual: '', nueva: '', nueva2: '' })
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Mi cuenta</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
        <Card>
          <h2 className="font-semibold text-fuchsia-800 border-b border-slate-100 pb-3 mb-4">
            Datos personales
          </h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Nombre y apellido</dt>
              <dd className="font-medium text-slate-700">{cliente?.nombre}</dd>
            </div>
            <div>
              <dt className="text-slate-500">DNI</dt>
              <dd className="font-medium text-slate-700">{cliente?.dni}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium text-slate-700">{cliente?.email}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Teléfono</dt>
              <dd className="font-medium text-slate-700">{cliente?.telefono || '—'}</dd>
            </div>
          </dl>
          <p className="text-xs text-slate-400 mt-4">
            Para corregir tus datos personales, acercate al comercio o contactá a quien administra el programa.
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold text-fuchsia-800 border-b border-slate-100 pb-3 mb-4">
            Cambiar contraseña
          </h2>
          <form onSubmit={cambiarPassword} className="space-y-4">
            <Input
              label="Contraseña actual"
              type="password"
              value={form.actual}
              onChange={(e) => setForm((f) => ({ ...f, actual: e.target.value }))}
              required
              autoComplete="current-password"
            />
            <Input
              label="Nueva contraseña (mínimo 8)"
              type="password"
              value={form.nueva}
              onChange={(e) => setForm((f) => ({ ...f, nueva: e.target.value }))}
              minLength={8}
              required
              autoComplete="new-password"
            />
            <Input
              label="Repetir nueva contraseña"
              type="password"
              value={form.nueva2}
              onChange={(e) => setForm((f) => ({ ...f, nueva2: e.target.value }))}
              minLength={8}
              required
              autoComplete="new-password"
            />
            {msg && (
              <p className={`text-sm ${msg.tipo === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{msg.texto}</p>
            )}
            <Button type="submit" className="!bg-fuchsia-700 hover:!bg-fuchsia-800" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Actualizar contraseña'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
