import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input, Card, Badge, puntos, formatTarjeta } from '../components/ui'

const VACIO = { nombre: '', dni: '', email: '', telefono: '' }

export default function Clientes() {
  const { isAdmin } = useAuth()
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(VACIO)
  const [editId, setEditId] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  async function cargar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('clientes')
      .select('*, tarjetas(numero, puntos, activa)')
      .order('created_at', { ascending: false })
    if (error) setMsg({ tipo: 'error', texto: error.message })
    setClientes(data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  function tarjetaDe(c) {
    return Array.isArray(c.tarjetas) ? c.tarjetas[0] : c.tarjetas
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter((c) => {
      const t = tarjetaDe(c)
      return (
        c.nombre?.toLowerCase().includes(q) ||
        String(c.dni || '').includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        String(t?.numero || '').includes(q.replace(/\s/g, ''))
      )
    })
  }, [clientes, busqueda])

  function editar(c) {
    setEditId(c.id)
    setForm({ nombre: c.nombre, dni: c.dni, email: c.email || '', telefono: c.telefono || '' })
    setMsg(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelar() {
    setEditId(null)
    setForm(VACIO)
  }

  async function guardar(e) {
    e.preventDefault()
    setMsg(null)
    if (!form.nombre.trim() || !form.dni.trim()) {
      setMsg({ tipo: 'error', texto: 'Nombre y DNI son obligatorios.' })
      return
    }
    const payload = {
      nombre: form.nombre.trim(),
      dni: form.dni.trim(),
      email: form.email.trim() || null,
      telefono: form.telefono.trim() || null,
    }
    let error
    if (editId) {
      ;({ error } = await supabase.from('clientes').update(payload).eq('id', editId))
    } else {
      ;({ error } = await supabase.from('clientes').insert(payload))
    }
    if (error) {
      const dup = error.message.includes('dni')
      setMsg({ tipo: 'error', texto: dup ? 'Ya existe un cliente con ese DNI.' : error.message })
      return
    }
    setMsg({
      tipo: 'ok',
      texto: editId ? 'Cliente actualizado.' : 'Cliente creado y tarjeta emitida automáticamente.',
    })
    cancelar()
    cargar()
  }

  async function eliminar(c) {
    if (!confirm(`¿Eliminar al cliente "${c.nombre}"? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('clientes').delete().eq('id', c.id)
    if (error) {
      setMsg({ tipo: 'error', texto: error.message })
      return
    }
    setMsg({ tipo: 'ok', texto: 'Cliente eliminado.' })
    cargar()
  }

  function onTel(e) {
    // Máscara simple: solo dígitos, hasta 10
    const d = e.target.value.replace(/\D/g, '').slice(0, 10)
    setForm((f) => ({ ...f, telefono: d }))
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Clientes</h1>

      {msg && (
        <div
          className={`rounded-lg px-4 py-2 text-sm ${
            msg.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {msg.texto}
        </div>
      )}

      {isAdmin && (
        <Card>
          <h2 className="font-semibold text-slate-700 mb-3">
            {editId ? 'Editar cliente' : 'Nuevo cliente'}
          </h2>
          <form onSubmit={guardar} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <Input
              label="Nombre y apellido"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              required
            />
            <Input
              label="DNI"
              value={form.dni}
              onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value.replace(/\D/g, '') }))}
              required
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <Input label="Teléfono" value={form.telefono} onChange={onTel} placeholder="Solo números" />
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                {editId ? 'Guardar' : 'Crear'}
              </Button>
              {editId && (
                <Button type="button" variant="secondary" onClick={cancelar}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
          {!editId && (
            <p className="text-xs text-slate-400 mt-2">
              Al crear el cliente se le emite automáticamente una tarjeta virtual única de 16 dígitos.
            </p>
          )}
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-semibold text-slate-700">
            Listado <span className="text-slate-400 font-normal">({filtrados.length})</span>
          </h2>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, DNI, email o tarjeta…"
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-full sm:w-80 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {loading ? (
          <p className="text-slate-500">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-slate-400">No hay clientes que coincidan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">DNI</th>
                  <th className="py-2 pr-3">Contacto</th>
                  <th className="py-2 pr-3">Tarjeta</th>
                  <th className="py-2 pr-3 text-right">Puntos</th>
                  {isAdmin && <th className="py-2 pr-3 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => {
                  const t = tarjetaDe(c)
                  return (
                    <tr key={c.id} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-3 font-medium text-slate-700" data-label="Cliente">
                        {c.nombre}
                      </td>
                      <td className="py-2 pr-3" data-label="DNI">
                        {c.dni}
                      </td>
                      <td className="py-2 pr-3 text-slate-500" data-label="Contacto">
                        <div>{c.email || '—'}</div>
                        {c.telefono && <div className="text-xs">{c.telefono}</div>}
                      </td>
                      <td className="py-2 pr-3 font-mono text-slate-600 whitespace-nowrap" data-label="Tarjeta">
                        {t ? formatTarjeta(t.numero) : '—'}
                        {t && !t.activa && (
                          <span className="ml-2">
                            <Badge color="red">inactiva</Badge>
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right" data-label="Puntos">
                        <Badge color="amber">⭐ {puntos(t?.puntos || 0)}</Badge>
                      </td>
                      {isAdmin && (
                        <td className="py-2 pr-3" data-label="Acciones">
                          <div className="flex gap-2 justify-end">
                            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => editar(c)}>
                              ✏️ Editar
                            </Button>
                            <Button
                              variant="ghost"
                              className="px-2 py-1 text-xs text-red-600"
                              onClick={() => eliminar(c)}
                            >
                              🗑️
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
