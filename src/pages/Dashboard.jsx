import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Card, Stat, Badge, money, puntos, formatTarjeta } from '../components/ui'

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [clientes, setClientes] = useState(0)
  const [tarjetas, setTarjetas] = useState([])
  const [cargas, setCargas] = useState([])
  const [pxp, setPxp] = useState(1000)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [{ count: cCount }, { data: tData }, { data: cargData }, { data: cfg }] = await Promise.all([
        supabase.from('clientes').select('id', { count: 'exact', head: true }),
        supabase.from('tarjetas').select('id, numero, puntos, activa, cliente_id, clientes(nombre)'),
        supabase.from('cargas').select('*').order('created_at', { ascending: false }),
        supabase.from('config').select('pesos_por_punto').eq('id', 1).single(),
      ])
      if (!vivo) return
      setClientes(cCount || 0)
      setTarjetas(tData || [])
      setCargas(cargData || [])
      if (cfg?.pesos_por_punto) setPxp(Number(cfg.pesos_por_punto))
      setLoading(false)
    })()
    return () => {
      vivo = false
    }
  }, [])

  const stats = useMemo(() => {
    const puntosCirculacion = tarjetas.reduce((a, t) => a + Number(t.puntos || 0), 0)
    const puntosOtorgados = cargas.reduce((a, c) => a + Number(c.puntos || 0), 0)
    const facturado = cargas.reduce((a, c) => a + Number(c.factura_pesos || 0), 0)
    const manual = cargas.filter((c) => c.origen === 'manual').length
    const api = cargas.filter((c) => c.origen === 'api').length
    return { puntosCirculacion, puntosOtorgados, facturado, manual, api }
  }, [tarjetas, cargas])

  // Top 5 clientes por puntos acumulados
  const topClientes = useMemo(
    () =>
      [...tarjetas]
        .sort((a, b) => Number(b.puntos) - Number(a.puntos))
        .slice(0, 5),
    [tarjetas]
  )

  // Puntos otorgados por mes (últimos 6 meses con datos)
  const porMes = useMemo(() => {
    const map = new Map()
    cargas.forEach((c) => {
      const d = new Date(c.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      map.set(key, (map.get(key) || 0) + Number(c.puntos || 0))
    })
    const arr = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
    const max = Math.max(1, ...arr.map(([, v]) => v))
    return arr.map(([k, v]) => {
      const [y, m] = k.split('-')
      const etiqueta = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-AR', {
        month: 'short',
        year: '2-digit',
      })
      return { etiqueta, valor: v, pct: Math.round((v / max) * 100) }
    })
  }, [cargas])

  if (loading) return <div className="text-slate-500">Cargando estadísticas…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <span className="text-sm text-slate-500">
          Equivalencia actual: <b>{money(pxp)}</b> = <b>1 punto</b>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Clientes" value={puntos(clientes)} icon="👥" color="indigo" />
        <Stat
          label="Tarjetas activas"
          value={puntos(tarjetas.filter((t) => t.activa).length)}
          sub={`${tarjetas.length} en total`}
          icon="💳"
          color="sky"
        />
        <Stat label="Puntos en circulación" value={puntos(stats.puntosCirculacion)} icon="⭐" color="amber" />
        <Stat
          label="Puntos otorgados (histórico)"
          value={puntos(stats.puntosOtorgados)}
          sub={`${cargas.length} cargas`}
          icon="📈"
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Total facturado cargado" value={money(stats.facturado)} icon="🧾" color="violet" />
        <Stat label="Cargas manuales" value={puntos(stats.manual)} icon="✍️" color="sky" />
        <Stat label="Cargas por API" value={puntos(stats.api)} icon="🔌" color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de puntos por mes */}
        <Card>
          <h2 className="font-semibold text-slate-700 mb-4">Puntos otorgados por mes</h2>
          {porMes.length === 0 ? (
            <p className="text-sm text-slate-400">Todavía no hay cargas registradas.</p>
          ) : (
            <div className="flex items-end gap-3 h-48">
              {porMes.map((b) => (
                <div key={b.etiqueta} className="flex-1 flex flex-col items-center justify-end gap-2">
                  <span className="text-xs font-semibold text-slate-600">{puntos(b.valor)}</span>
                  <div
                    className="w-full bg-indigo-500 rounded-t-md transition-all"
                    style={{ height: `${Math.max(4, b.pct)}%` }}
                    title={`${b.etiqueta}: ${puntos(b.valor)} puntos`}
                  />
                  <span className="text-xs text-slate-400 capitalize">{b.etiqueta}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Top clientes */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700">Top clientes por puntos</h2>
            <Link to="/clientes" className="text-sm text-indigo-600 hover:underline">
              Ver todos
            </Link>
          </div>
          {topClientes.length === 0 ? (
            <p className="text-sm text-slate-400">Sin datos.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {topClientes.map((t, i) => (
                <li key={t.id} className="flex items-center justify-between py-2 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-slate-400 font-semibold w-5 text-center">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="font-medium text-slate-700 truncate">
                        {t.clientes?.nombre || '—'}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">{formatTarjeta(t.numero)}</div>
                    </div>
                  </div>
                  <Badge color="amber">⭐ {puntos(t.puntos)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Últimas cargas */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-700">Últimas cargas</h2>
          <Link to="/auditoria" className="text-sm text-indigo-600 hover:underline">
            Ver auditoría completa
          </Link>
        </div>
        {cargas.length === 0 ? (
          <p className="text-sm text-slate-400">Sin cargas todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Factura</th>
                  <th className="py-2 pr-3 text-right">Importe</th>
                  <th className="py-2 pr-3 text-right">Puntos</th>
                  <th className="py-2 pr-3">Origen</th>
                </tr>
              </thead>
              <tbody>
                {cargas.slice(0, 8).map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3" data-label="Fecha">
                      {new Date(c.created_at).toLocaleString('es-AR')}
                    </td>
                    <td className="py-2 pr-3" data-label="Cliente">
                      {c.cliente_nombre || '—'}
                    </td>
                    <td className="py-2 pr-3" data-label="Factura">
                      {c.factura_numero || '—'}
                    </td>
                    <td className="py-2 pr-3 text-right" data-label="Importe">
                      {money(c.factura_pesos)}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold text-amber-600" data-label="Puntos">
                      +{puntos(c.puntos)}
                    </td>
                    <td className="py-2 pr-3" data-label="Origen">
                      <Badge color={c.origen === 'api' ? 'green' : 'sky'}>{c.origen}</Badge>
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
