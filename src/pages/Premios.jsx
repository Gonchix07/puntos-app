import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input, Select, Card, Badge, puntos, formatTarjeta } from '../components/ui'
import ClienteCombo from '../components/ClienteCombo'

const VACIO = { titulo: '', descripcion: '', foto_url: '', puntos_necesarios: '', stock: '', comercio_id: '', activo: true }

// Solo dígitos + separador de miles es-AR ("80000" -> "80.000") mientras se escribe
function soloDigitos(v) {
  return String(v).replace(/\D/g, '')
}
function formatMiles(d) {
  return d ? new Intl.NumberFormat('es-AR').format(Number(d)) : ''
}

// Pill de comercio (con logo) o "General"
function ComercioPill({ comercioId, nombre, logo }) {
  if (!comercioId) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
        🌐 General
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
      {logo ? (
        <img src={logo} alt="" className="h-4 w-4 rounded-sm object-contain" />
      ) : (
        '🏬'
      )}
      {nombre || 'Comercio'}
    </span>
  )
}

export default function Premios() {
  const { isAdmin, profile } = useAuth()
  const [premios, setPremios] = useState([])
  const [clientes, setClientes] = useState([])
  const [comercios, setComercios] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [toast, setToast] = useState(null)

  // Formulario admin
  const [form, setForm] = useState(VACIO)
  const [editId, setEditId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const fileRef = useRef(null)

  // Modal de canje
  const [canjePremio, setCanjePremio] = useState(null)
  const [canjeClienteId, setCanjeClienteId] = useState('')
  const [canjeando, setCanjeando] = useState(false)
  const [canjeMsg, setCanjeMsg] = useState(null)
  const [saldos, setSaldos] = useState([]) // [{comercio_id, comercio_nombre, puntos}]
  const [saldosLoading, setSaldosLoading] = useState(false)

  async function cargar() {
    setLoading(true)
    const [{ data: pData }, { data: cData }, { data: coData }] = await Promise.all([
      supabase.from('premios').select('*, comercios(nombre, logo_url)').order('created_at', { ascending: false }),
      supabase
        .from('clientes')
        .select('id, nombre, dni, tarjetas(numero, puntos, puntos_remanentes, activa)')
        .order('nombre'),
      supabase.from('comercios').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    setPremios(
      (pData || []).map((p) => ({
        ...p,
        comercio_nombre: p.comercios?.nombre || null,
        comercio_logo: p.comercios?.logo_url || null,
      }))
    )
    setClientes(
      (cData || []).map((c) => {
        const t = Array.isArray(c.tarjetas) ? c.tarjetas[0] : c.tarjetas
        return {
          ...c,
          tarjeta_numero: t?.numero,
          tarjeta_puntos: Number(t?.puntos || 0),
          tarjeta_remanentes: Number(t?.puntos_remanentes || 0),
          tarjeta_activa: t?.activa,
        }
      })
    )
    setComercios(coData || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  // ---------- CRUD admin ----------
  function editar(p) {
    setEditId(p.id)
    setForm({
      titulo: p.titulo,
      descripcion: p.descripcion || '',
      foto_url: p.foto_url || '',
      puntos_necesarios: String(Math.round(Number(p.puntos_necesarios || 0))),
      stock: String(p.stock),
      comercio_id: p.comercio_id || '',
      activo: p.activo,
    })
    setMsg(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelar() {
    setEditId(null)
    setForm(VACIO)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function subirFoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setMsg(null)
    setSubiendo(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const nombre = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('premios').upload(nombre, file, { upsert: false })
      if (error) throw error
      const { data } = supabase.storage.from('premios').getPublicUrl(nombre)
      setForm((f) => ({ ...f, foto_url: data.publicUrl }))
    } catch (err) {
      setMsg({
        tipo: 'error',
        texto:
          'No se pudo subir la foto: ' +
          err.message +
          '. Verificá que corriste la migración (bucket "premios") o pegá una URL de imagen.',
      })
    } finally {
      setSubiendo(false)
    }
  }

  async function guardar(e) {
    e.preventDefault()
    setMsg(null)
    const pts = Number(form.puntos_necesarios)
    const stk = Number(form.stock)
    if (!form.titulo.trim()) {
      setMsg({ tipo: 'error', texto: 'El título es obligatorio.' })
      return
    }
    if (!(pts > 0)) {
      setMsg({ tipo: 'error', texto: 'Los puntos necesarios deben ser mayores a cero.' })
      return
    }
    if (!(stk >= 0) || !Number.isInteger(stk)) {
      setMsg({ tipo: 'error', texto: 'El stock debe ser un número entero mayor o igual a cero.' })
      return
    }
    setGuardando(true)
    const payload = {
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim() || null,
      foto_url: form.foto_url.trim() || null,
      puntos_necesarios: pts,
      stock: stk,
      comercio_id: form.comercio_id || null,
      activo: form.activo,
    }
    const { error } = editId
      ? await supabase.from('premios').update(payload).eq('id', editId)
      : await supabase.from('premios').insert(payload)
    setGuardando(false)
    if (error) {
      setMsg({ tipo: 'error', texto: error.message })
      return
    }
    setMsg({ tipo: 'ok', texto: editId ? 'Premio actualizado.' : 'Premio creado.' })
    cancelar()
    cargar()
  }

  async function eliminar(p) {
    if (!confirm(`¿Eliminar el premio "${p.titulo}"?`)) return
    const { error } = await supabase.from('premios').delete().eq('id', p.id)
    if (error) {
      setMsg({ tipo: 'error', texto: error.message })
      return
    }
    setMsg({ tipo: 'ok', texto: 'Premio eliminado.' })
    cargar()
  }

  // ---------- Canje ----------
  function abrirCanje(premio) {
    setCanjePremio(premio)
    setCanjeClienteId('')
    setCanjeMsg(null)
    setSaldos([])
  }
  function cerrarCanje() {
    setCanjePremio(null)
    setCanjeClienteId('')
    setCanjeMsg(null)
    setSaldos([])
  }

  async function elegirClienteCanje(id) {
    setCanjeClienteId(id)
    setCanjeMsg(null)
    setSaldos([])
    if (!id) return
    setSaldosLoading(true)
    const { data, error } = await supabase.rpc('saldos_cliente', { p_cliente_id: id })
    setSaldosLoading(false)
    if (error) {
      setCanjeMsg(error.message)
      return
    }
    setSaldos(
      (data || []).map((s) => ({
        ...s,
        saldo: Number(s.saldo || 0),
        pendiente: Number(s.pendiente || 0),
        remanente: Number(s.remanente || 0),
      }))
    )
  }

  const clienteCanje = clientes.find((c) => c.id === canjeClienteId) || null
  const esGeneral = canjePremio ? !canjePremio.comercio_id : true
  // Disponible para SOLICITAR = remanentes (acumulados − pendientes)
  const remanenteComercio = canjePremio?.comercio_id
    ? Number(saldos.find((s) => s.comercio_id === canjePremio.comercio_id)?.remanente || 0)
    : 0
  const disponible = esGeneral ? Number(clienteCanje?.tarjeta_remanentes || 0) : remanenteComercio
  const costo = Number(canjePremio?.puntos_necesarios || 0)
  const puntosSuficientes = !!clienteCanje && disponible >= costo

  async function confirmarCanje() {
    setCanjeMsg(null)
    if (!clienteCanje) {
      setCanjeMsg('Elegí un cliente.')
      return
    }
    if (!clienteCanje.tarjeta_numero) {
      setCanjeMsg('El cliente no tiene una tarjeta emitida.')
      return
    }
    setCanjeando(true)
    const { data, error } = await supabase.rpc('crear_solicitud', {
      p_cliente_id: clienteCanje.id,
      p_premio_id: canjePremio.id,
    })
    setCanjeando(false)
    if (error) {
      setCanjeMsg(error.message)
      return
    }
    setToast({
      cliente: data.cliente,
      premio: data.premio,
      usados: data.puntos,
    })
    setTimeout(() => setToast(null), 4500)
    cerrarCanje()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-800">Canje de premios</h1>
        <span className="text-sm text-slate-500">{premios.length} premio(s) en el catálogo</span>
      </div>

      {msg && (
        <div
          className={`rounded-lg px-4 py-2 text-sm ${
            msg.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {msg.texto}
        </div>
      )}

      {/* Formulario de alta/edición (solo admin) */}
      {isAdmin && (
        <Card>
          <h2 className="font-semibold text-slate-700 mb-3">{editId ? 'Editar premio' : 'Nuevo premio'}</h2>
          <form onSubmit={guardar} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <Input
                label="Título"
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                required
              />
              <label className="block">
                <span className="block text-sm font-medium text-slate-600 mb-1">Descripción</span>
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Puntos necesarios"
                  value={formatMiles(form.puntos_necesarios)}
                  onChange={(e) => setForm((f) => ({ ...f, puntos_necesarios: soloDigitos(e.target.value) }))}
                  inputMode="numeric"
                  required
                />
                <Input
                  label="Stock"
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock}
                  onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                  required
                />
              </div>
              <Select
                label="Disponible en"
                value={form.comercio_id}
                onChange={(e) => setForm((f) => ({ ...f, comercio_id: e.target.value }))}
              >
                <option value="">General (todos los comercios)</option>
                {comercios.map((co) => (
                  <option key={co.id} value={co.id}>
                    {co.nombre}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-slate-400">
                General: se canjea con el total de puntos. De un comercio: solo con los puntos acumulados en ese
                comercio.
              </p>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                />
                Activo (visible para canje)
              </label>
            </div>

            <div className="space-y-3">
              <span className="block text-sm font-medium text-slate-600">Foto del premio</span>
              <div className="flex items-start gap-3">
                <div className="h-28 w-28 shrink-0 rounded-lg border border-slate-200 bg-slate-50 grid place-items-center overflow-hidden">
                  {form.foto_url ? (
                    <img src={form.foto_url} alt="Vista previa" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl">🎁</span>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={subiendo}
                    onClick={() => fileRef.current?.click()}
                  >
                    {subiendo ? 'Subiendo…' : '⬆️ Subir foto'}
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={subirFoto}
                  />
                  <Input
                    label="o pegá una URL de imagen"
                    value={form.foto_url}
                    onChange={(e) => setForm((f) => ({ ...f, foto_url: e.target.value }))}
                    placeholder="https://…"
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-2 flex gap-2">
              <Button type="submit" disabled={guardando || subiendo}>
                {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear premio'}
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

      {/* Catálogo */}
      {loading ? (
        <p className="text-slate-500">Cargando catálogo…</p>
      ) : premios.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400">Todavía no hay premios en el catálogo.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {premios.map((p) => {
            const sinStock = p.stock <= 0
            const inactivo = !p.activo
            return (
              <Card
                key={p.id}
                className={`relative flex flex-col p-0 overflow-hidden min-h-[340px] ${inactivo ? 'opacity-60' : ''}`}
              >
                {/* Imagen de fondo (ocupa toda la tarjeta) */}
                {p.foto_url ? (
                  <img src={p.foto_url} alt={p.titulo} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 grid place-items-center bg-slate-100 text-6xl">🎁</div>
                )}
                {/* Degradado para que el texto se lea sobre la foto */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

                {/* Contenido apoyado abajo, sin fondo blanco */}
                <div className="relative mt-auto p-4 flex flex-col gap-2 text-white">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-white drop-shadow-sm">{p.titulo}</h3>
                    {inactivo && <Badge color="slate">inactivo</Badge>}
                  </div>
                  {p.descripcion && (
                    <p className="text-sm text-white/85 line-clamp-2 drop-shadow-sm">{p.descripcion}</p>
                  )}
                  <div>
                    <ComercioPill comercioId={p.comercio_id} nombre={p.comercio_nombre} logo={p.comercio_logo} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge color="amber">⭐ {puntos(p.puntos_necesarios)} pts</Badge>
                    <span
                      className={`text-xs font-semibold drop-shadow-sm ${
                        sinStock ? 'text-red-300' : 'text-white/90'
                      }`}
                    >
                      {sinStock ? 'Sin stock' : `Stock: ${p.stock}`}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1" disabled={sinStock || inactivo} onClick={() => abrirCanje(p)}>
                      Solicitar canje
                    </Button>
                    {isAdmin && (
                      <>
                        <Button
                          variant="ghost"
                          className="px-2 text-white bg-white/10 hover:bg-white/20"
                          onClick={() => editar(p)}
                          title="Editar"
                        >
                          ✏️
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-2 text-white bg-white/10 hover:bg-white/20"
                          onClick={() => eliminar(p)}
                          title="Eliminar"
                        >
                          🗑️
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal de canje */}
      {canjePremio && (
        <div className="fixed inset-0 z-40 bg-black/40 grid place-items-center px-4" onClick={cerrarCanje}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-lg text-slate-800">Solicitar canje</h2>
                <p className="text-sm text-slate-500">{canjePremio.titulo}</p>
                <span className="mt-1 inline-block">
                  <ComercioPill
                    comercioId={canjePremio.comercio_id}
                    nombre={canjePremio.comercio_nombre}
                    logo={canjePremio.comercio_logo}
                  />
                </span>
              </div>
              <Badge color="amber">⭐ {puntos(canjePremio.puntos_necesarios)} pts</Badge>
            </div>

            <ClienteCombo
              label="Cliente que canjea"
              clientes={clientes}
              value={canjeClienteId}
              onChange={elegirClienteCanje}
            />

            {clienteCanje && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm space-y-1">
                <div className="text-slate-500">
                  Tarjeta:{' '}
                  <span className="font-mono text-slate-700">
                    {clienteCanje.tarjeta_numero
                      ? formatTarjeta(clienteCanje.tarjeta_numero)
                      : '— sin tarjeta —'}
                  </span>
                </div>
                {saldosLoading ? (
                  <div className="text-slate-400">Cargando saldos…</div>
                ) : (
                  <>
                    <div className="text-slate-500">
                      {esGeneral
                        ? 'Puntos remanentes (total disponible):'
                        : `Remanentes en ${canjePremio.comercio_nombre || 'el comercio'}:`}{' '}
                      <b className={puntosSuficientes ? 'text-green-600' : 'text-red-600'}>
                        ⭐ {puntos(disponible)}
                      </b>
                    </div>
                    {esGeneral && saldos.length > 0 && (
                      <div className="text-xs text-slate-400">
                        {saldos.map((s) => `${s.comercio_nombre}: ${puntos(s.remanente)}`).join(' · ')}
                      </div>
                    )}
                    <div className="text-xs text-slate-400">
                      Los remanentes descuentan los canjes pendientes. Los puntos acumulados no bajan hasta
                      confirmar el canje.
                    </div>
                    {!puntosSuficientes && (
                      <div className="text-xs text-red-600">
                        Faltan {puntos(costo - disponible)} puntos para este premio.
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {canjeMsg && <p className="text-sm text-red-600">{canjeMsg}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={cerrarCanje}>
                Cancelar
              </Button>
              <Button
                onClick={confirmarCanje}
                disabled={canjeando || !clienteCanje || !puntosSuficientes}
              >
                {canjeando ? 'Creando…' : 'Solicitar canje'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast de confirmación */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="toast-pop bg-green-600 text-white rounded-xl shadow-lg px-5 py-4">
            <div className="font-semibold">📝 Solicitud creada</div>
            <div className="text-sm opacity-95">
              {toast.cliente} · <b>{toast.premio}</b> ({puntos(toast.usados)} pts). Queda <b>pendiente</b> en
              Solicitudes.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
