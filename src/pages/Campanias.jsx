import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input, Select, Card, Badge } from '../components/ui'
import ClienteMultiSelect from '../components/ClienteMultiSelect'

const VACIO = {
  nombre: '',
  descripcion: '',
  descuento_porcentaje: '',
  local_id: '',
  fecha_desde: '',
  fecha_hasta: '',
  puntos_minimos: '',
  activa: true,
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

// Estado real de la campaña según su vigencia + flag activa.
function estadoDe(c) {
  if (!c.activa) return { label: 'Inactiva', color: 'slate' }
  const hoy = hoyISO()
  if (c.fecha_desde > hoy) return { label: 'Próxima', color: 'sky' }
  if (c.fecha_hasta && c.fecha_hasta < hoy) return { label: 'Vencida', color: 'red' }
  return { label: 'Vigente', color: 'green' }
}

export default function Campanias() {
  const { isAdmin } = useAuth()
  const [campanias, setCampanias] = useState([])
  const [locales, setLocales] = useState([])
  const [grupos, setGrupos] = useState([])
  const [clientes, setClientes] = useState([])
  const [relClientes, setRelClientes] = useState([]) // [{campania_id, cliente_id}]
  const [relGrupos, setRelGrupos] = useState([]) // [{campania_id, grupo_id}]
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const [form, setForm] = useState(VACIO)
  const [editId, setEditId] = useState(null)
  const [clientesSel, setClientesSel] = useState([])
  const [gruposSel, setGruposSel] = useState([])

  async function cargar() {
    setLoading(true)
    const [
      { data: cData },
      { data: locData },
      { data: grData },
      { data: cliData },
      { data: rcData },
      { data: rgData },
    ] = await Promise.all([
      supabase
        .from('campanias')
        .select('*, locales(nombre)')
        .order('created_at', { ascending: false }),
      supabase.from('locales').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('grupos').select('id, nombre').order('nombre'),
      supabase.from('clientes').select('id, nombre, dni').order('nombre'),
      supabase.from('campania_clientes').select('campania_id, cliente_id'),
      supabase.from('campania_grupos').select('campania_id, grupo_id'),
    ])
    setCampanias((cData || []).map((c) => ({ ...c, local_nombre: c.locales?.nombre || null })))
    setLocales(locData || [])
    setGrupos(grData || [])
    setClientes(cliData || [])
    setRelClientes(rcData || [])
    setRelGrupos(rgData || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const conteos = useMemo(() => {
    const m = new Map()
    relClientes.forEach((r) => {
      const cur = m.get(r.campania_id) || { clientes: 0, grupos: 0 }
      cur.clientes++
      m.set(r.campania_id, cur)
    })
    relGrupos.forEach((r) => {
      const cur = m.get(r.campania_id) || { clientes: 0, grupos: 0 }
      cur.grupos++
      m.set(r.campania_id, cur)
    })
    return m
  }, [relClientes, relGrupos])

  function editar(c) {
    setEditId(c.id)
    setForm({
      nombre: c.nombre,
      descripcion: c.descripcion || '',
      descuento_porcentaje: String(c.descuento_porcentaje),
      local_id: c.local_id || '',
      fecha_desde: c.fecha_desde,
      fecha_hasta: c.fecha_hasta || '',
      puntos_minimos: c.puntos_minimos ? String(c.puntos_minimos) : '',
      activa: c.activa,
    })
    setClientesSel(relClientes.filter((r) => r.campania_id === c.id).map((r) => r.cliente_id))
    setGruposSel(relGrupos.filter((r) => r.campania_id === c.id).map((r) => r.grupo_id))
    setMsg(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelar() {
    setEditId(null)
    setForm(VACIO)
    setClientesSel([])
    setGruposSel([])
  }

  async function guardar(e) {
    e.preventDefault()
    setMsg(null)

    if (!form.nombre.trim()) {
      setMsg({ tipo: 'error', texto: 'El nombre es obligatorio.' })
      return
    }
    const pct = Number(form.descuento_porcentaje)
    if (!(pct > 0) || pct > 100) {
      setMsg({ tipo: 'error', texto: 'El descuento debe ser un porcentaje entre 0 y 100.' })
      return
    }
    if (!form.fecha_desde) {
      setMsg({ tipo: 'error', texto: 'La fecha de inicio de vigencia es obligatoria.' })
      return
    }
    if (form.fecha_hasta && form.fecha_hasta < form.fecha_desde) {
      setMsg({ tipo: 'error', texto: 'La fecha de fin no puede ser anterior a la de inicio.' })
      return
    }
    const minimo = form.puntos_minimos === '' ? 0 : Number(form.puntos_minimos)
    if (!(minimo >= 0)) {
      setMsg({ tipo: 'error', texto: 'El mínimo de puntos debe ser un número mayor o igual a cero.' })
      return
    }
    if (clientesSel.length === 0 && gruposSel.length === 0) {
      setMsg({ tipo: 'error', texto: 'Seleccioná al menos un cliente individual o un grupo destinatario.' })
      return
    }

    setGuardando(true)
    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      descuento_porcentaje: pct,
      local_id: form.local_id || null,
      fecha_desde: form.fecha_desde,
      fecha_hasta: form.fecha_hasta || null,
      puntos_minimos: minimo,
      activa: form.activa,
    }

    let campaniaId = editId
    if (editId) {
      const { error } = await supabase.from('campanias').update(payload).eq('id', editId)
      if (error) {
        setGuardando(false)
        setMsg({ tipo: 'error', texto: error.message })
        return
      }
      // Reemplaza los destinatarios: borra y vuelve a insertar
      await supabase.from('campania_clientes').delete().eq('campania_id', editId)
      await supabase.from('campania_grupos').delete().eq('campania_id', editId)
    } else {
      const { data, error } = await supabase.from('campanias').insert(payload).select().single()
      if (error) {
        setGuardando(false)
        setMsg({ tipo: 'error', texto: error.message })
        return
      }
      campaniaId = data.id
    }

    if (clientesSel.length > 0) {
      await supabase
        .from('campania_clientes')
        .insert(clientesSel.map((cliente_id) => ({ campania_id: campaniaId, cliente_id })))
    }
    if (gruposSel.length > 0) {
      await supabase
        .from('campania_grupos')
        .insert(gruposSel.map((grupo_id) => ({ campania_id: campaniaId, grupo_id })))
    }

    setGuardando(false)
    setMsg({ tipo: 'ok', texto: editId ? 'Campaña actualizada.' : 'Campaña creada.' })
    cancelar()
    cargar()
  }

  async function toggleActiva(c) {
    const { error } = await supabase.from('campanias').update({ activa: !c.activa }).eq('id', c.id)
    if (error) {
      setMsg({ tipo: 'error', texto: error.message })
      return
    }
    cargar()
  }

  async function eliminar(c) {
    if (!confirm(`¿Eliminar la campaña "${c.nombre}"? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('campanias').delete().eq('id', c.id)
    if (error) {
      setMsg({ tipo: 'error', texto: error.message })
      return
    }
    setMsg({ tipo: 'ok', texto: 'Campaña eliminada.' })
    cargar()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Campañas</h1>
      <p className="text-sm text-slate-500 -mt-2">
        Ofertas de % de descuento asignadas a clientes individuales y/o grupos, generales o restringidas a un
        local, con vigencia por fecha y un mínimo opcional de puntos acumulados para participar. El sistema
        de facturación las consulta por tarjeta o DNI vía API.
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

      {isAdmin && (
        <Card>
          <h2 className="font-semibold text-slate-700 mb-3">{editId ? 'Editar campaña' : 'Nueva campaña'}</h2>
          <form onSubmit={guardar} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <Input
                label="Nombre de la campaña"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                required
              />
              <Input
                label="Descuento (%)"
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={form.descuento_porcentaje}
                onChange={(e) => setForm((f) => ({ ...f, descuento_porcentaje: e.target.value }))}
                required
              />
              <Input
                label="Puntos mínimos acumulados (opcional)"
                type="number"
                min="0"
                step="1"
                value={form.puntos_minimos}
                onChange={(e) => setForm((f) => ({ ...f, puntos_minimos: e.target.value }))}
                placeholder="0 = sin mínimo"
              />
              <Input
                label="Vigente desde"
                type="date"
                value={form.fecha_desde}
                onChange={(e) => setForm((f) => ({ ...f, fecha_desde: e.target.value }))}
                required
              />
              <Input
                label="Vigente hasta (opcional)"
                type="date"
                value={form.fecha_hasta}
                onChange={(e) => setForm((f) => ({ ...f, fecha_hasta: e.target.value }))}
                min={form.fecha_desde || undefined}
              />
            </div>
            <p className="text-xs text-slate-400 -mt-2">
              Dejá "Vigente hasta" vacío para que la campaña no venza por fecha (se da de baja manualmente).
              El mínimo de puntos se compara contra los puntos <b>acumulados</b> totales del cliente (no el
              remanente disponible). Pueden existir múltiples campañas superpuestas para distintos clientes o
              grupos.
            </p>

            <label className="block">
              <span className="block text-sm font-medium text-slate-600 mb-1">Descripción (opcional)</span>
              <textarea
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>

            <Select
              label="Criterio: local donde aplica"
              value={form.local_id}
              onChange={(e) => setForm((f) => ({ ...f, local_id: e.target.value }))}
            >
              <option value="">General (todos los locales)</option>
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </Select>
            {locales.length === 0 && (
              <p className="text-xs text-amber-600 -mt-2">
                No hay locales activos todavía. Podés crearlos en Configuración → Locales, o dejar la campaña
                como General.
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ClienteMultiSelect
                label="Clientes individuales (opcional)"
                clientes={clientes}
                value={clientesSel}
                onChange={setClientesSel}
              />
              <div>
                <span className="block text-sm font-medium text-slate-600 mb-1">Grupos (opcional)</span>
                {grupos.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No hay grupos todavía. Creá uno desde Clientes.
                  </p>
                ) : (
                  <>
                    {gruposSel.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {gruposSel.map((id) => {
                          const g = grupos.find((gr) => gr.id === id)
                          if (!g) return null
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium px-2 py-1 rounded-full"
                            >
                              {g.nombre}
                              <button
                                type="button"
                                onClick={() => setGruposSel((sel) => sel.filter((v) => v !== id))}
                                className="text-indigo-400 hover:text-indigo-700"
                                aria-label={`Quitar ${g.nombre}`}
                              >
                                ✕
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    )}
                    <Select
                      value=""
                      onChange={(e) => {
                        const id = e.target.value
                        if (id) setGruposSel((sel) => (sel.includes(id) ? sel : [...sel, id]))
                      }}
                    >
                      <option value="">— Agregar un grupo —</option>
                      {grupos
                        .filter((g) => !gruposSel.includes(g.id))
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.nombre}
                          </option>
                        ))}
                    </Select>
                  </>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-400 -mt-2">
              Podés combinar clientes individuales y grupos en la misma campaña; se otorga a la unión de ambos.
            </p>

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={form.activa}
                onChange={(e) => setForm((f) => ({ ...f, activa: e.target.checked }))}
              />
              Activa
            </label>

            <div className="flex gap-2">
              <Button type="submit" disabled={guardando}>
                {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear campaña'}
              </Button>
              {editId && (
                <Button type="button" variant="secondary" onClick={cancelar}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold text-slate-700 mb-3">
          Campañas <span className="text-slate-400 font-normal">({campanias.length})</span>
        </h2>
        {loading ? (
          <p className="text-slate-500">Cargando…</p>
        ) : campanias.length === 0 ? (
          <p className="text-sm text-slate-400">Todavía no hay campañas creadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Campaña</th>
                  <th className="py-2 pr-3 text-right">Descuento</th>
                  <th className="py-2 pr-3">Local</th>
                  <th className="py-2 pr-3">Vigencia</th>
                  <th className="py-2 pr-3 text-right">Mín. puntos</th>
                  <th className="py-2 pr-3">Destinatarios</th>
                  <th className="py-2 pr-3">Estado</th>
                  {isAdmin && <th className="py-2 pr-3 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {campanias.map((c) => {
                  const est = estadoDe(c)
                  const cnt = conteos.get(c.id) || { clientes: 0, grupos: 0 }
                  return (
                    <tr key={c.id} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-3" data-label="Campaña">
                        <div className="font-medium text-slate-700">{c.nombre}</div>
                        {c.descripcion && <div className="text-xs text-slate-400">{c.descripcion}</div>}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold text-indigo-600" data-label="Descuento">
                        {c.descuento_porcentaje}%
                      </td>
                      <td className="py-2 pr-3" data-label="Local">
                        {c.local_id ? c.local_nombre || '—' : <Badge color="sky">General</Badge>}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-500" data-label="Vigencia">
                        {c.fecha_desde} → {c.fecha_hasta || 'sin vencimiento'}
                      </td>
                      <td className="py-2 pr-3 text-right text-slate-500" data-label="Mín. puntos">
                        {Number(c.puntos_minimos) > 0 ? c.puntos_minimos : '—'}
                      </td>
                      <td className="py-2 pr-3 text-slate-500" data-label="Destinatarios">
                        {cnt.clientes} cliente{cnt.clientes !== 1 ? 's' : ''} · {cnt.grupos} grupo
                        {cnt.grupos !== 1 ? 's' : ''}
                      </td>
                      <td className="py-2 pr-3" data-label="Estado">
                        <Badge color={est.color}>{est.label}</Badge>
                      </td>
                      {isAdmin && (
                        <td className="py-2 pr-3" data-label="Acciones">
                          <div className="flex gap-2 justify-end flex-wrap">
                            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => editar(c)}>
                              ✏️ Editar
                            </Button>
                            <Button
                              variant="ghost"
                              className={`px-2 py-1 text-xs ${c.activa ? 'text-amber-600' : 'text-green-600'}`}
                              onClick={() => toggleActiva(c)}
                            >
                              {c.activa ? '⏸️ Desactivar' : '▶️ Activar'}
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
