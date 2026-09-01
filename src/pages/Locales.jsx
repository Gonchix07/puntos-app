import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Button, Input, Card, Badge } from '../components/ui'

const VACIO = { nombre: '', direccion: '', logo_url: '', activo: true }

export default function Locales() {
  const [locales, setLocales] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(VACIO)
  const [editId, setEditId] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const fileRef = useRef(null)

  async function cargar() {
    setLoading(true)
    const { data, error } = await supabase.from('locales').select('*').order('nombre')
    if (error) setMsg({ tipo: 'error', texto: error.message })
    setLocales(data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return locales
    return locales.filter(
      (l) => l.nombre?.toLowerCase().includes(q) || l.direccion?.toLowerCase().includes(q)
    )
  }, [locales, busqueda])

  function editar(l) {
    setEditId(l.id)
    setForm({
      nombre: l.nombre,
      direccion: l.direccion || '',
      logo_url: l.logo_url || '',
      activo: l.activo,
    })
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
      const { error } = await supabase.storage.from('locales').upload(nombre, file, { upsert: false })
      if (error) throw error
      const { data } = supabase.storage.from('locales').getPublicUrl(nombre)
      setForm((f) => ({ ...f, logo_url: data.publicUrl }))
    } catch (err) {
      setMsg({
        tipo: 'error',
        texto:
          'No se pudo subir el logo: ' +
          err.message +
          '. Verificá que corriste la migración (bucket "locales") o pegá una URL.',
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
    const payload = {
      nombre: form.nombre.trim(),
      direccion: form.direccion.trim() || null,
      logo_url: form.logo_url.trim() || null,
      activo: form.activo,
    }
    const { error } = editId
      ? await supabase.from('locales').update(payload).eq('id', editId)
      : await supabase.from('locales').insert(payload)
    if (error) {
      const dup = error.message.includes('duplicate') || error.message.includes('nombre')
      setMsg({ tipo: 'error', texto: dup ? 'Ya existe un local con ese nombre.' : error.message })
      return
    }
    setMsg({ tipo: 'ok', texto: editId ? 'Local actualizado.' : 'Local creado.' })
    cancelar()
    cargar()
  }

  async function toggleActivo(l) {
    const { error } = await supabase.from('locales').update({ activo: !l.activo }).eq('id', l.id)
    if (error) {
      setMsg({ tipo: 'error', texto: error.message })
      return
    }
    cargar()
  }

  async function eliminar(l) {
    if (!confirm(`¿Eliminar el local "${l.nombre}"?`)) return
    const { error } = await supabase.from('locales').delete().eq('id', l.id)
    if (error) {
      setMsg({
        tipo: 'error',
        texto: error.message.includes('foreign')
          ? 'No se puede eliminar: hay campañas que usan este local. Podés darlo de baja en su lugar.'
          : error.message,
      })
      return
    }
    setMsg({ tipo: 'ok', texto: 'Local eliminado.' })
    cargar()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Locales comerciales</h1>
      <p className="text-sm text-slate-500 -mt-2">
        Puntos físicos de venta que pueden usarse para restringir una campaña a un único local.
      </p>

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
        <h2 className="font-semibold text-slate-700 mb-3">{editId ? 'Editar local' : 'Nuevo local'}</h2>
        <form onSubmit={guardar} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <Input
            label="Nombre del local"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            required
          />
          <Input
            label="Dirección"
            value={form.direccion}
            onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
            placeholder="Calle 123, Ciudad"
          />
          <div className="md:col-span-2">
            <span className="block text-sm font-medium text-slate-600 mb-1">Logo</span>
            <div className="flex items-start gap-3">
              <div className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 grid place-items-center overflow-hidden">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-2xl">📍</span>
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
            Activo (disponible al crear campañas)
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
            placeholder="Buscar por nombre o dirección…"
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {loading ? (
          <p className="text-slate-500">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-slate-400">No hay locales que coincidan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Local</th>
                  <th className="py-2 pr-3">Dirección</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((l) => (
                  <tr key={l.id} className={`border-b border-slate-100 ${l.activo ? '' : 'opacity-60'}`}>
                    <td className="py-2 pr-3 font-medium text-slate-700" data-label="Local">
                      <div className="flex items-center gap-2 justify-end lg:justify-start">
                        <div className="h-8 w-8 shrink-0 rounded grid place-items-center overflow-hidden">
                          {l.logo_url ? (
                            <img src={l.logo_url} alt={l.nombre} className="h-full w-full object-contain" />
                          ) : (
                            <span className="text-sm">📍</span>
                          )}
                        </div>
                        <span>{l.nombre}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-slate-500" data-label="Dirección">
                      {l.direccion || '—'}
                    </td>
                    <td className="py-2 pr-3" data-label="Estado">
                      <Badge color={l.activo ? 'green' : 'slate'}>{l.activo ? 'Activo' : 'Inactivo'}</Badge>
                    </td>
                    <td className="py-2 pr-3" data-label="Acciones">
                      <div className="flex gap-2 justify-end flex-wrap">
                        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => editar(l)}>
                          ✏️ Editar
                        </Button>
                        <Button
                          variant="ghost"
                          className={`px-2 py-1 text-xs ${l.activo ? 'text-amber-600' : 'text-green-600'}`}
                          onClick={() => toggleActivo(l)}
                        >
                          {l.activo ? '⏸️ Baja' : '▶️ Alta'}
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-xs text-red-600"
                          onClick={() => eliminar(l)}
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
