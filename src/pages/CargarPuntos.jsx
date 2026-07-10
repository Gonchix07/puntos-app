import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Button, Input, Card, money, puntos, formatTarjeta } from '../components/ui'
import ClienteCombo from '../components/ClienteCombo'

// "$ 1.234.567" mientras se escribe
function soloDigitos(v) {
  return String(v).replace(/\D/g, '')
}
function formatPesos(digitos) {
  if (!digitos) return ''
  return '$ ' + new Intl.NumberFormat('es-AR').format(Number(digitos))
}

export default function CargarPuntos() {
  const [clientes, setClientes] = useState([])
  const [pxp, setPxp] = useState(1000)
  const [clienteId, setClienteId] = useState('')
  const [facturaNumero, setFacturaNumero] = useState('')
  const [pesosDigitos, setPesosDigitos] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [toast, setToast] = useState(null)

  async function cargarDatos() {
    const [{ data: cData }, { data: cfg }] = await Promise.all([
      supabase
        .from('clientes')
        .select('id, nombre, dni, tarjetas(numero, puntos, activa)')
        .order('nombre'),
      supabase.from('config').select('pesos_por_punto').eq('id', 1).single(),
    ])
    const mapped = (cData || []).map((c) => {
      const t = Array.isArray(c.tarjetas) ? c.tarjetas[0] : c.tarjetas
      return { ...c, tarjeta_numero: t?.numero, tarjeta_puntos: t?.puntos, tarjeta_activa: t?.activa }
    })
    setClientes(mapped)
    if (cfg?.pesos_por_punto) setPxp(Number(cfg.pesos_por_punto))
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  const cliente = clientes.find((c) => c.id === clienteId) || null
  const pesos = Number(pesosDigitos || 0)
  const puntosPreview = useMemo(() => (pxp > 0 ? Math.floor(pesos / pxp) : 0), [pesos, pxp])

  async function enviar(e) {
    e.preventDefault()
    setMsg(null)
    if (!cliente) {
      setMsg({ tipo: 'error', texto: 'Elegí un cliente.' })
      return
    }
    if (!cliente.tarjeta_numero) {
      setMsg({ tipo: 'error', texto: 'El cliente no tiene una tarjeta emitida.' })
      return
    }
    if (pesos <= 0) {
      setMsg({ tipo: 'error', texto: 'Ingresá el importe de la factura.' })
      return
    }
    setEnviando(true)
    const { data, error } = await supabase.rpc('cargar_puntos', {
      p_numero: cliente.tarjeta_numero,
      p_factura_pesos: pesos,
      p_factura_numero: facturaNumero.trim() || null,
      p_origen: 'manual',
    })
    setEnviando(false)
    if (error) {
      setMsg({ tipo: 'error', texto: error.message })
      return
    }
    setToast({
      cliente: data.cliente,
      puntos: data.puntos_otorgados,
      total: data.puntos_totales,
    })
    setTimeout(() => setToast(null), 4000)
    // Reset del formulario y refresco de saldos
    setFacturaNumero('')
    setPesosDigitos('')
    setClienteId('')
    cargarDatos()
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-800">Cargar puntos</h1>
      <p className="text-sm text-slate-500">
        Convertí el importe de una factura en puntos. Equivalencia actual:{' '}
        <b>{money(pxp)}</b> = <b>1 punto</b>.
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
        <form onSubmit={enviar} className="space-y-4">
          <ClienteCombo
            label="Cliente"
            clientes={clientes}
            value={clienteId}
            onChange={setClienteId}
          />

          {cliente && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm flex flex-wrap gap-x-6 gap-y-1">
              <span className="text-slate-500">
                Tarjeta:{' '}
                <span className="font-mono text-slate-700">
                  {cliente.tarjeta_numero ? formatTarjeta(cliente.tarjeta_numero) : '— sin tarjeta —'}
                </span>
              </span>
              <span className="text-slate-500">
                Puntos actuales: <b className="text-amber-600">⭐ {puntos(cliente.tarjeta_puntos || 0)}</b>
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="N° de factura (opcional)"
              value={facturaNumero}
              onChange={(e) => setFacturaNumero(e.target.value)}
              placeholder="0001-00001234"
            />
            <Input
              label="Importe de la factura"
              value={formatPesos(pesosDigitos)}
              onChange={(e) => setPesosDigitos(soloDigitos(e.target.value))}
              inputMode="numeric"
              placeholder="$ 0"
            />
          </div>

          <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-indigo-700">Puntos a otorgar</span>
            <span className="text-2xl font-bold text-indigo-700">⭐ {puntos(puntosPreview)}</span>
          </div>

          <Button type="submit" disabled={enviando} className="w-full sm:w-auto">
            {enviando ? 'Cargando…' : 'Cargar puntos'}
          </Button>
        </form>
      </Card>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="toast-pop bg-green-600 text-white rounded-xl shadow-lg px-5 py-4">
            <div className="font-semibold">✅ Puntos cargados</div>
            <div className="text-sm opacity-95">
              {toast.cliente}: <b>+{puntos(toast.puntos)}</b> pts (total {puntos(toast.total)})
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
