import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Button, Card, Select, Input, Badge, puntos } from '../components/ui'
import ClienteCombo from '../components/ClienteCombo'

// Ajuste de puntos (solo admin): ingreso/egreso por comercio, justificado
// por un motivo. Se registra como carga con origen 'ajuste' (RPC ajustar_puntos).

const MOTIVOS_AJUSTE = {
  ingreso: ['Promoción / bonificación', 'Corrección de carga', 'Migración de otro sistema', 'Otro'],
  egreso: ['Corrección de carga', 'Puntos otorgados por error', 'Vencimiento de puntos', 'Otro'],
}

// Solo dígitos + separador de miles es-AR mientras se escribe
function soloDigitos(v) {
  return String(v).replace(/\D/g, '')
}
function formatMiles(d) {
  return d ? new Intl.NumberFormat('es-AR').format(Number(d)) : ''
}

export default function AjustePuntos() {
  const { profile } = useAuth()
  const [clientes, setClientes] = useState([])
  const [comercios, setComercios] = useState([])
  const [clienteId, setClienteId] = useState('')
  const [saldos, setSaldos] = useState([])
  const [saldosLoading, setSaldosLoading] = useState(false)
  const [form, setForm] = useState({ comercio_id: '', tipo: 'ingreso', puntos: '', motivo: '' })
  const [msg, setMsg] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [{ data: cData }, { data: coData }] = await Promise.all([
        supabase
          .from('clientes')
          .select('id, nombre, dni, activo, tarjetas(numero)')
          .eq('activo', true)
          .order('nombre'),
        supabase.from('comercios').select('id, nombre').eq('activo', true).order('nombre'),
      ])
      setClientes(
        (cData || []).map((c) => {
          const t = Array.isArray(c.tarjetas) ? c.tarjetas[0] : c.tarjetas
          return { ...c, tarjeta_numero: t?.numero }
        })
      )
      setComercios(coData || [])
    })()
  }, [])

  async function elegirCliente(id) {
    setClienteId(id)
    setMsg(null)
    setSaldos([])
    if (!id) return
    setSaldosLoading(true)
    const { data } = await supabase.rpc('saldos_cliente', { p_cliente_id: id })
    setSaldosLoading(false)
    setSaldos(data || [])
  }

  async function guardar(e) {
    e.preventDefault()
    setMsg(null)
    const pts = Number(form.puntos)
    if (!clienteId) {
      setMsg({ tipo: 'error', texto: 'Elegí un cliente.' })
      return
    }
    if (!form.comercio_id) {
      setMsg({ tipo: 'error', texto: 'Elegí el comercio del ajuste.' })
      return
    }
    if (!(pts > 0)) {
      setMsg({ tipo: 'error', texto: 'Los puntos deben ser mayores a cero.' })
      return
    }
    if (!form.motivo) {
      setMsg({ tipo: 'error', texto: 'Elegí el motivo del ajuste.' })
      return
    }
    setGuardando(true)
    const { data, error } = await supabase.rpc('ajustar_puntos', {
      p_cliente_id: clienteId,
      p_comercio_id: form.comercio_id,
      p_tipo: form.tipo,
      p_puntos: pts,
      p_motivo: form.motivo,
      p_usuario_email: profile?.email,
    })
    setGuardando(false)
    if (error) {
      setMsg({ tipo: 'error', texto: error.message })
      return
    }
    setMsg({
      tipo: 'ok',
      texto: `Ajuste registrado: ${data.puntos > 0 ? '+' : ''}${puntos(data.puntos)} puntos a ${data.cliente} en ${data.comercio}.`,
    })
    setForm((f) => ({ ...f, puntos: '', motivo: '' }))
    elegirCliente(clienteId) // refresca saldos
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Ajuste de puntos</h1>

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
        <form onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ClienteCombo label="Cliente" clientes={clientes} value={clienteId} onChange={elegirCliente} />
            <Select
              label="Comercio"
              value={form.comercio_id}
              onChange={(e) => setForm((f) => ({ ...f, comercio_id: e.target.value }))}
              required
            >
              <option value="">Elegí el comercio…</option>
              {comercios.map((co) => (
                <option key={co.id} value={co.id}>
                  {co.nombre}
                </option>
              ))}
            </Select>
          </div>

          {clienteId && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm">
              {saldosLoading ? (
                <span className="text-slate-400">Cargando saldos…</span>
              ) : saldos.length === 0 ? (
                <span className="text-slate-400">El cliente no tiene puntos acumulados.</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {saldos.map((s) => (
                    <Badge key={s.comercio_id} color="amber">
                      {s.comercio_nombre}: ⭐ {puntos(s.saldo)}
                      {Number(s.pendiente) > 0 && ` (disp: ${puntos(s.remanente)})`}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <Select
              label="Movimiento"
              value={form.tipo}
              onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value, motivo: '' }))}
            >
              <option value="ingreso">➕ Ingreso de puntos</option>
              <option value="egreso">➖ Egreso de puntos</option>
            </Select>
            <Input
              label="Puntos"
              value={formatMiles(form.puntos)}
              onChange={(e) => setForm((f) => ({ ...f, puntos: soloDigitos(e.target.value) }))}
              inputMode="numeric"
              required
            />
            <Select
              label="Motivo"
              value={form.motivo}
              onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
              required
            >
              <option value="">Elegí un motivo…</option>
              {MOTIVOS_AJUSTE[form.tipo].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Registrando…' : 'Registrar ajuste'}
            </Button>
          </div>

          <p className="text-xs text-slate-400">
            El ajuste queda registrado en la Auditoría con su motivo y usuario. Los egresos validan el saldo
            del comercio y los puntos disponibles (descontando canjes pendientes).
          </p>
        </form>
      </Card>
    </div>
  )
}
