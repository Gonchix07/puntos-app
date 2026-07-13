import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Button, Card, Badge, puntos, formatTarjeta } from '../components/ui'

const ESTADOS = [
  { key: 'pendiente', label: 'Pendientes', badge: 'amber', chip: 'Pendiente' },
  { key: 'revision', label: 'En revisión', badge: 'sky', chip: 'En revisión' },
  { key: 'confirmado', label: 'Canje confirmado', badge: 'indigo', chip: 'Canje confirmado' },
  { key: 'entregado', label: 'Premio entregado', badge: 'green', chip: 'Premio entregado' },
  { key: 'rechazada', label: 'Rechazadas', badge: 'red', chip: 'Rechazada' },
]
const CHIP = Object.fromEntries(ESTADOS.map((e) => [e.key, e]))

// Acciones disponibles según el estado actual
const ACCIONES = {
  pendiente: [
    { to: 'revision', label: 'Pasar a revisión', variant: 'secondary' },
    { to: 'rechazada', label: 'Rechazar', variant: 'danger' },
  ],
  revision: [
    { to: 'confirmado', label: '✅ Confirmar canje', variant: 'primary', warn: true },
    { to: 'rechazada', label: 'Rechazar', variant: 'danger' },
  ],
  confirmado: [{ to: 'entregado', label: '📦 Marcar entregado', variant: 'primary' }],
  entregado: [],
  rechazada: [],
}

export default function SolicitudesPremios() {
  const [solicitudes, setSolicitudes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('pendiente')
  const [msg, setMsg] = useState(null)
  const [procesando, setProcesando] = useState(null)

  async function cargar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('solicitudes')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setMsg({ tipo: 'error', texto: error.message })
    setSolicitudes(data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const conteos = useMemo(() => {
    const c = {}
    solicitudes.forEach((s) => (c[s.estado] = (c[s.estado] || 0) + 1))
    return c
  }, [solicitudes])

  const filtradas = useMemo(
    () => (filtro === 'todas' ? solicitudes : solicitudes.filter((s) => s.estado === filtro)),
    [solicitudes, filtro]
  )

  async function cambiar(sol, nuevo) {
    if (nuevo === 'confirmado') {
      if (!confirm(`Confirmar el canje de "${sol.premio_titulo}" para ${sol.cliente_nombre}.\n\nSe descontarán ${puntos(sol.puntos)} puntos y una unidad de stock. ¿Continuar?`))
        return
    } else if (nuevo === 'rechazada') {
      if (!confirm('¿Rechazar esta solicitud?')) return
    }
    setMsg(null)
    setProcesando(sol.id)
    const { error } = await supabase.rpc('cambiar_estado_solicitud', {
      p_solicitud_id: sol.id,
      p_nuevo_estado: nuevo,
    })
    setProcesando(null)
    if (error) {
      setMsg({ tipo: 'error', texto: error.message })
      return
    }
    setMsg({ tipo: 'ok', texto: `Solicitud actualizada a "${CHIP[nuevo]?.chip || nuevo}".` })
    cargar()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Solicitudes de premios</h1>
      <p className="text-sm text-slate-500 -mt-2">
        Las solicitudes surgen del canje de un cliente. Recorren: Pendiente → En revisión → Canje confirmado →
        Premio entregado. Los puntos y el stock se descuentan al <b>confirmar el canje</b>.
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

      {/* Filtro por estado */}
      <div className="flex flex-wrap gap-2">
        {ESTADOS.map((e) => (
          <button
            key={e.key}
            onClick={() => setFiltro(e.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
              filtro === e.key
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {e.label} <span className="opacity-70">({conteos[e.key] || 0})</span>
          </button>
        ))}
        <button
          onClick={() => setFiltro('todas')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
            filtro === 'todas'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Todas <span className="opacity-70">({solicitudes.length})</span>
        </button>
      </div>

      <Card>
        {loading ? (
          <p className="text-slate-500">Cargando…</p>
        ) : filtradas.length === 0 ? (
          <p className="text-sm text-slate-400">No hay solicitudes en este estado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Premio</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Comercio</th>
                  <th className="py-2 pr-3 text-right">Puntos</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap" data-label="Fecha">
                      {new Date(s.created_at).toLocaleString('es-AR')}
                    </td>
                    <td className="py-2 pr-3 font-medium text-slate-700" data-label="Premio">
                      {s.premio_titulo}
                    </td>
                    <td className="py-2 pr-3" data-label="Cliente">
                      <div>{s.cliente_nombre || '—'}</div>
                      <div className="text-xs text-slate-400 font-mono">{formatTarjeta(s.numero_tarjeta)}</div>
                    </td>
                    <td className="py-2 pr-3" data-label="Comercio">
                      {s.comercio_id ? s.comercio_nombre : 'General'}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold text-amber-600" data-label="Puntos">
                      {puntos(s.puntos)}
                    </td>
                    <td className="py-2 pr-3" data-label="Estado">
                      <Badge color={CHIP[s.estado]?.badge || 'slate'}>{CHIP[s.estado]?.chip || s.estado}</Badge>
                    </td>
                    <td className="py-2 pr-3" data-label="Acciones">
                      <div className="flex gap-2 justify-end flex-wrap">
                        {(ACCIONES[s.estado] || []).map((a) => (
                          <Button
                            key={a.to}
                            variant={a.variant}
                            className="px-2 py-1 text-xs"
                            disabled={procesando === s.id}
                            onClick={() => cambiar(s, a.to)}
                          >
                            {procesando === s.id ? '…' : a.label}
                          </Button>
                        ))}
                        {(ACCIONES[s.estado] || []).length === 0 && (
                          <span className="text-xs text-slate-400">—</span>
                        )}
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
