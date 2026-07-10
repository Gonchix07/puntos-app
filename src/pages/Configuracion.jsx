import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Button, Card, money, puntos } from '../components/ui'

function soloDigitos(v) {
  return String(v).replace(/\D/g, '')
}
function formatPesos(d) {
  if (!d) return ''
  return '$ ' + new Intl.NumberFormat('es-AR').format(Number(d))
}

export default function Configuracion() {
  const [digitos, setDigitos] = useState('1000')
  const [guardado, setGuardado] = useState('1000')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('config').select('pesos_por_punto').eq('id', 1).single()
      const v = String(Math.round(Number(data?.pesos_por_punto || 1000)))
      setDigitos(v)
      setGuardado(v)
      setLoading(false)
    })()
  }, [])

  async function guardar(e) {
    e.preventDefault()
    setMsg(null)
    const valor = Number(digitos)
    if (!valor || valor <= 0) {
      setMsg({ tipo: 'error', texto: 'El valor debe ser mayor a cero.' })
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('config')
      .update({ pesos_por_punto: valor, updated_at: new Date().toISOString() })
      .eq('id', 1)
    setSaving(false)
    if (error) {
      setMsg({ tipo: 'error', texto: error.message })
      return
    }
    setGuardado(digitos)
    setMsg({ tipo: 'ok', texto: 'Configuración guardada.' })
  }

  const valor = Number(digitos || 0)
  const ejemplos = [5000, 10000, 25000, 100000]

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-800">Configuración</h1>

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
        <h2 className="font-semibold text-slate-700 mb-1">Relación pesos por punto</h2>
        <p className="text-sm text-slate-500 mb-4">
          Definí cuántos pesos equivalen a <b>1 punto</b>. Los puntos se calculan como la parte entera
          de <code>importe ÷ pesos por punto</code>.
        </p>
        {loading ? (
          <p className="text-slate-500">Cargando…</p>
        ) : (
          <form onSubmit={guardar} className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="block text-sm font-medium text-slate-600 mb-1">Pesos por punto</span>
              <input
                value={formatPesos(digitos)}
                onChange={(e) => setDigitos(soloDigitos(e.target.value))}
                inputMode="numeric"
                className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48 text-lg font-semibold"
              />
            </label>
            <div className="text-sm text-slate-500 pb-2">
              = <b>1 punto</b>
            </div>
            <Button type="submit" disabled={saving || digitos === guardado}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </form>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-700 mb-3">Ejemplos con la configuración actual</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3">Importe de factura</th>
                <th className="py-2 pr-3 text-right">Puntos otorgados</th>
              </tr>
            </thead>
            <tbody>
              {ejemplos.map((e) => (
                <tr key={e} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{money(e)}</td>
                  <td className="py-2 pr-3 text-right font-semibold text-amber-600">
                    ⭐ {puntos(valor > 0 ? Math.floor(e / valor) : 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
