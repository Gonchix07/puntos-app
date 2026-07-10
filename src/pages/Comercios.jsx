import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Button, Input, Card, Badge } from '../components/ui'

const VACIO = { nombre: '', activo: true }

export default function Comercios() {
  const [comercios, setComercios] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(VACIO)
  const [editId, setEditId] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  async function cargar() {
    setLoading(true)
    const { data, error } = await supabase.from('comercios').select('*').order('nombre')
    if (error) setMsg({ tipo: 'error', texto: error.message })
    setComercios(data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return comercios
    return comercios.filter((c) => c.nombre?.toLowerCase().includes(q))
  }, [comercios, busqueda])

  function editar(c) {
    setEditId(c.id)
    setForm({ nombre: c.nombre, activo: c.activo })
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
    if (!form.nombre.trim()) {
      setMsg({ tipo: 'error', texto: 'El nombre es obligatorio.' })
      return
    }
    const payload = { nombre: form.nombre.trim(), activo: form.activo }
    const { error } = editId
      ? await supabase.from('comercios').update(payload).eq('id', editId)
      : await supabase.from('comercios').insert(payload)
    if (error) {
      const dup = error.message.includes('duplicate') || error.message.includes('nombre')
      setMsg({ tipo: 'error', texto: dup ? 'Ya existe un comercio con ese nombre.' : error.message })
      return
    }
    setMsg({ tipo: 'ok', texto: editId ? 'Comercio actualizado.' : 'Comercio creado.' })
    cancelar()
    cargar()
  }

  async function toggleActivo(c) {
    const { error } = await supabase.from('comercios').update({ activo: !c.activo }).eq('id', c.id)
    if (error) {
      setMsg({ tipo: 'error', texto: error.message })
      return
    }
    cargar()
  }

  async function eliminar(c) {
    if (!confirm(`¿Eliminar el comercio "${c.nombre}"? Las cargas anteriores conservan el nombre registrado.`))
      return
    const { error } = await supabase.from('comercios').delete().eq('id', c.id)
    if (error) {
      setMsg({ tipo: 'error', texto: error.message })
      return
    }
    setMsg({ tipo: 'ok', texto: 'Comercio eliminado.' })
    cargar()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Comercios</h1>

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
        <h2 className="font-semibold text-slate-700 mb-3">{editId ? 'Editar comercio' : 'Nuevo comercio'}</h2>
        <form onSubmit={guardar} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <Input
            label="Nombre del comercio"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            required
          />
          <label className="flex items-center gap-2 text-sm text-slate-600 pb-2">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
            />
            Activo (disponible al cargar puntos)
          </label>
          <div className="flex gap-2">
            <Button type="submit">{editId ? 'Guardar' : 'Crear'}</Button>
            {editId && (
              <Button type="button" variant="secondary" onClick={cancelar}>
                Cancelar
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-semibold text-slate-700">
            Listado <span className="text-slate-400 font-normal">({filtrados.length})</span>
          </h2>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre…"
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {loading ? (
          <p className="text-slate-500">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-slate-400">No hay comercios que coincidan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Comercio</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr key={c.id} className={`border-b border-slate-100 ${c.activo ? '' : 'opacity-60'}`}>
                    <td className="py-2 pr-3 font-medium text-slate-700" data-label="Comercio">
                      {c.nombre}
                    </td>
                    <td className="py-2 pr-3" data-label="Estado">
                      <Badge color={c.activo ? 'green' : 'slate'}>{c.activo ? 'Activo' : 'Inactivo'}</Badge>
                    </td>
                    <td className="py-2 pr-3" data-label="Acciones">
                      <div className="flex gap-2 justify-end flex-wrap">
                        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => editar(c)}>
                          ✏️ Editar
                        </Button>
                        <Button
                          variant="ghost"
                          className={`px-2 py-1 text-xs ${c.activo ? 'text-amber-600' : 'text-green-600'}`}
                          onClick={() => toggleActivo(c)}
                        >
                          {c.activo ? '⏸️ Baja' : '▶️ Alta'}
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
