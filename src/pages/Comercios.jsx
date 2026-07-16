import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Button, Input, Card, Badge } from '../components/ui'

const VACIO = { nombre: '', logo_url: '', activo: true }

export default function Comercios() {
  const [comercios, setComercios] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(VACIO)
  const [editId, setEditId] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const fileRef = useRef(null)

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
    setForm({ nombre: c.nombre, logo_url: c.logo_url || '', activo: c.activo })
    setMsg(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function cancelar() {
    setEditId(null)
    setForm(VACIO)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function subirLogo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setMsg(null)
    setSubiendo(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const nombre = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('comercios').upload(nombre, file, { upsert: false })
      if (error) throw error
      const { data } = supabase.storage.from('comercios').getPublicUrl(nombre)
      setForm((f) => ({ ...f, logo_url: data.publicUrl }))
    } catch (err) {
      setMsg({
        tipo: 'error',
        texto:
          'No se pudo subir el logo: ' +
          err.message +
          '. Verificá que corriste la migración (bucket "comercios") o pegá una URL.',
      })
    } finally {
      setSubiendo(false)
    }
  }

  async function guardar(e) {
    e.preventDefault()
    setMsg(null)
    if (!form.nombre.trim()) {
      setMsg({ tipo: 'error', texto: 'El nombre es obligatorio.' })
      return
    }
    const payload = { nombre: form.nombre.trim(), logo_url: form.logo_url.trim() || null, activo: form.activo }
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
          <div className="md:col-span-3">
            <span className="block text-sm font-medium text-slate-600 mb-1">Logo</span>
            <div className="flex items-start gap-3">
              <div className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 grid place-items-center overflow-hidden">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-2xl">🏬</span>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={subiendo}
                  onClick={() => fileRef.current?.click()}
                >
                  {subiendo ? 'Subiendo…' : '⬆️ Subir logo'}
                </Button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={subirLogo} />
                <Input
                  label="o pegá una URL de imagen"
                  value={form.logo_url}
                  onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
                  placeholder="https://…"
                />
              </div>
            </div>
          </div>
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
                      <div className="flex items-center gap-2 justify-end lg:justify-start">
                        <div className="h-8 w-8 shrink-0 rounded grid place-items-center overflow-hidden">
                          {c.logo_url ? (
                            <img src={c.logo_url} alt={c.nombre} className="h-full w-full object-contain" />
                          ) : (
                            <span className="text-sm">🏬</span>
                          )}
                        </div>
                        <span>{c.nombre}</span>
                      </div>
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
