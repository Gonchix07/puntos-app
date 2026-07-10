import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Button, Input, Select, Card, Badge } from '../components/ui'

const VACIO = { email: '', password: '', role: 'operador' }

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(VACIO)
  const [editId, setEditId] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function cargar() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, email, role, created_at')
      .order('created_at', { ascending: false })
    setUsuarios(data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  async function llamarApi(method, body) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin-users', {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify(body),
    })
    // Si no vuelve JSON, la función serverless no está corriendo (típico con
    // `npm run dev`, que no ejecuta las funciones /api). Damos un mensaje claro.
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      throw new Error(
        'La función /api/admin-users no está disponible. El ABM de usuarios necesita el backend serverless: usá "vercel dev" localmente o el sitio deployado en Vercel (con SUPABASE_SERVICE_ROLE_KEY configurada).'
      )
    }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || 'Error en la operación')
    return json
  }

  function cancelar() {
    setEditId(null)
    setForm(VACIO)
  }

  async function guardar(e) {
    e.preventDefault()
    setMsg(null)
    setBusy(true)
    try {
      if (editId) {
        await llamarApi('PATCH', {
          userId: editId,
          email: form.email.trim(),
          password: form.password.trim() || undefined,
          role: form.role,
        })
        setMsg({ tipo: 'ok', texto: 'Usuario actualizado.' })
      } else {
        if (!form.password.trim() || form.password.trim().length < 6) {
          setBusy(false)
          setMsg({ tipo: 'error', texto: 'La contraseña debe tener al menos 6 caracteres.' })
          return
        }
        await llamarApi('POST', {
          email: form.email.trim(),
          password: form.password.trim(),
          role: form.role,
        })
        setMsg({ tipo: 'ok', texto: 'Usuario creado.' })
      }
      cancelar()
      cargar()
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message })
    }
    setBusy(false)
  }

  function editar(u) {
    setEditId(u.id)
    setForm({ email: u.email || '', password: '', role: u.role })
    setMsg(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function eliminar(u) {
    if (!confirm(`¿Eliminar al usuario ${u.email}?`)) return
    setMsg(null)
    try {
      await llamarApi('DELETE', { userId: u.id })
      setMsg({ tipo: 'ok', texto: 'Usuario eliminado.' })
      cargar()
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message })
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Usuarios</h1>

      {msg && (
        <div
          className={`rounded-lg px-4 py-2 text-sm ${
            msg.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {msg.texto}
        </div>
      )}

      <Card>
        <h2 className="font-semibold text-slate-700 mb-3">{editId ? 'Editar usuario' : 'Nuevo usuario'}</h2>
        <form onSubmit={guardar} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
          <Input
            label={editId ? 'Nueva contraseña (opcional)' : 'Contraseña'}
            type="text"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder={editId ? 'Dejar vacío para no cambiar' : 'Mínimo 6 caracteres'}
          />
          <Select
            label="Rol"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          >
            <option value="operador">Operador</option>
            <option value="admin">Administrador</option>
          </Select>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={busy}>
              {busy ? 'Guardando…' : editId ? 'Guardar' : 'Crear'}
            </Button>
            {editId && (
              <Button type="button" variant="secondary" onClick={cancelar}>
                Cancelar
              </Button>
            )}
          </div>
        </form>
        <p className="text-xs text-slate-400 mt-2">
          El ABM de usuarios requiere la función serverless <code>/api/admin-users</code> con la
          variable <code>SUPABASE_SERVICE_ROLE_KEY</code> configurada en Vercel.
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-700 mb-3">
          Listado <span className="text-slate-400 font-normal">({usuarios.length})</span>
        </h2>
        {loading ? (
          <p className="text-slate-500">Cargando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Rol</th>
                  <th className="py-2 pr-3">Creado</th>
                  <th className="py-2 pr-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-700" data-label="Email">
                      {u.email}
                    </td>
                    <td className="py-2 pr-3" data-label="Rol">
                      <Badge color={u.role === 'admin' ? 'amber' : 'sky'}>
                        {u.role === 'admin' ? '👑 Administrador' : '🧑‍💼 Operador'}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-slate-500" data-label="Creado">
                      {new Date(u.created_at).toLocaleDateString('es-AR')}
                    </td>
                    <td className="py-2 pr-3" data-label="Acciones">
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => editar(u)}>
                          ✏️ Editar
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-xs text-red-600"
                          onClick={() => eliminar(u)}
                        >
                          🗑️
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
