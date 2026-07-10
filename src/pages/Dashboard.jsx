import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Card, Stat, Badge, money, puntos, formatTarjeta } from '../components/ui'

const PERIODOS = [
  { label: 'Últimos 7 días', dias: 7 },
  { label: 'Últimos 30 días', dias: 30 },
  { label: 'Últimos 90 días', dias: 90 },
  { label: 'Último año', dias: 365 },
  { label: 'Todo el historial', dias: 0 },
]

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [dias, setDias] = useState(30)
  const [clientes, setClientes] = useState(0)
  const [tarjetas, setTarjetas] = useState([])
  const [cargas, setCargas] = useState([])
  const [canjes, setCanjes] = useState([])
  const [premios, setPremios] = useState([])
  const [pxp, setPxp] = useState(1000)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [{ count: cCount }, { data: tData }, { data: cargData }, { data: canjData }, { data: pData }, { data: cfg }] =
        await Promise.all([
          supabase.from('clientes').select('id', { count: 'exact', head: true }),
          supabase.from('tarjetas').select('id, numero, puntos, activa, cliente_id, clientes(nombre)'),
          supabase.from('cargas').select('*').order('created_at', { ascending: false }),
          supabase.from('canjes').select('*').order('created_at', { ascending: false }),
          supabase.from('premios').select('id, activo, stock'),
          supabase.from('config').select('pesos_por_punto').eq('id', 1).single(),
        ])
      if (!vivo) return
      setClientes(cCount || 0)
      setTarjetas(tData || [])
      setCargas(cargData || [])
      setCanjes(canjData || [])
      setPremios(pData || [])
      if (cfg?.pesos_por_punto) setPxp(Number(cfg.pesos_por_punto))
      setLoading(false)
    })()
    return () => {
      vivo = false
    }
  }, [])

  // Movimientos filtrados por el período elegido (0 = todo el historial)
  const cargasP = useMemo(() => {
    if (!dias) return cargas
    const corte = Date.now() - dias * 86400000
    return cargas.filter((c) => new Date(c.created_at).getTime() >= corte)
  }, [cargas, dias])
  const canjesP = useMemo(() => {
    if (!dias) return canjes
    const corte = Date.now() - dias * 86400000
    return canjes.filter((k) => new Date(k.created_at).getTime() >= corte)
  }, [canjes, dias])

  const stats = useMemo(() => {
    // Métricas de estado actual (no dependen del período)
    const puntosCirculacion = tarjetas.reduce((a, t) => a + Number(t.puntos || 0), 0)
    const premiosActivos = premios.filter((p) => p.activo).length
    const stockDisponible = premios.reduce((a, p) => a + Number(p.stock || 0), 0)
    // Métricas de flujo (dependen del período)
    const puntosOtorgados = cargasP.reduce((a, c) => a + Number(c.puntos || 0), 0)
    const facturado = cargasP.reduce((a, c) => a + Number(c.factura_pesos || 0), 0)
    const manual = cargasP.filter((c) => c.origen === 'manual').length
    const api = cargasP.filter((c) => c.origen === 'api').length
    const puntosCanjeados = canjesP.reduce((a, k) => a + Number(k.puntos || 0), 0)
    return {
      puntosCirculacion,
      premiosActivos,
      stockDisponible,
      puntosOtorgados,
      facturado,
      manual,
      api,
      cargasCount: cargasP.length,
      canjesCount: canjesP.length,
      puntosCanjeados,
      premiosCatalogo: premios.length,
    }
  }, [tarjetas, premios, cargasP, canjesP])

  // Top 5 premios más canjeados (dentro del período)
  const topPremios = useMemo(() => {
    const map = new Map()
    canjesP.forEach((k) => {
      const key = k.premio_titulo || '—'
      const cur = map.get(key) || { titulo: key, cantidad: 0, puntos: 0 }
      cur.cantidad += 1
      cur.puntos += Number(k.puntos || 0)
      map.set(key, cur)
    })
    return [...map.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 5)
  }, [canjesP])

  // Top 5 clientes por puntos acumulados (saldo actual, no depende del período)
  const topClientes = useMemo(
    () => [...tarjetas].sort((a, b) => Number(b.puntos) - Number(a.puntos)).slice(0, 5),
    [tarjetas]
  )

  // Puntos otorgados por mes (últimos 6 meses con datos, dentro del período)
  const porMes = useMemo(() => {
    const map = new Map()
    cargasP.forEach((c) => {
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
  }, [cargasP])

  if (loading) return <div className="text-slate-500">Cargando estadísticas…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-slate-500">
            Equivalencia: <b>{money(pxp)}</b> = <b>1 punto</b>
          </span>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500">Período:</label>
            <select
              className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={dias}
              onChange={(e) => setDias(Number(e.target.value))}
            >
              {PERIODOS.map((p) => (
                <option key={p.dias} value={p.dias}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-400 -mt-2">
        Cargas, canjes y facturación corresponden a{' '}
        <b>{dias > 0 ? `los últimos ${dias} días` : 'todo el historial'}</b>. Clientes, puntos en circulación,
        catálogo y stock reflejan el estado actual.
      </p>

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
          label="Puntos otorgados"
          value={puntos(stats.puntosOtorgados)}
          sub={`${stats.cargasCount} cargas en el período`}
          icon="📈"
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Total facturado" value={money(stats.facturado)} icon="🧾" color="violet" />
        <Stat label="Cargas manuales" value={puntos(stats.manual)} icon="✍️" color="sky" />
        <Stat label="Cargas por API" value={puntos(stats.api)} icon="🔌" color="green" />
      </div>

      {/* Estadísticas de canjes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Canjes realizados" value={puntos(stats.canjesCount)} icon="🎉" color="violet" />
        <Stat label="Puntos canjeados" value={puntos(stats.puntosCanjeados)} icon="🎁" color="amber" />
        <Stat
          label="Premios en catálogo"
          value={puntos(stats.premiosCatalogo)}
          sub={`${stats.premiosActivos} activos`}
          icon="🏷️"
          color="indigo"
        />
        <Stat label="Stock disponible" value={puntos(stats.stockDisponible)} icon="📦" color="sky" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de puntos por mes */}
        <Card>
          <h2 className="font-semibold text-slate-700 mb-4">Puntos otorgados por mes</h2>
          {porMes.length === 0 ? (
            <p className="text-sm text-slate-400">No hay cargas en el período elegido.</p>
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
                      <div className="font-medium text-slate-700 truncate">{t.clientes?.nombre || '—'}</div>
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

      {/* Últimas cargas del período */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-700">Últimas cargas</h2>
          <Link to="/auditoria" className="text-sm text-indigo-600 hover:underline">
            Ver auditoría completa
          </Link>
        </div>
        {cargasP.length === 0 ? (
          <p className="text-sm text-slate-400">Sin cargas en el período elegido.</p>
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
                {cargasP.slice(0, 8).map((c) => (
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

      {/* Canjes: top premios + últimos canjes (del período) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700">Top premios más canjeados</h2>
            <Link to="/premios" className="text-sm text-indigo-600 hover:underline">
              Ver catálogo
            </Link>
          </div>
          {topPremios.length === 0 ? (
            <p className="text-sm text-slate-400">No hay canjes en el período elegido.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {topPremios.map((p, i) => (
                <li key={p.titulo} className="flex items-center justify-between py-2 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-slate-400 font-semibold w-5 text-center">{i + 1}</span>
                    <span className="font-medium text-slate-700 truncate">{p.titulo}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge color="violet">{puntos(p.cantidad)} canje(s)</Badge>
                    <Badge color="amber">⭐ {puntos(p.puntos)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700">Últimos canjes</h2>
            <Link to="/auditoria" className="text-sm text-indigo-600 hover:underline">
              Ver auditoría completa
            </Link>
          </div>
          {canjesP.length === 0 ? (
            <p className="text-sm text-slate-400">Sin canjes en el período elegido.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {canjesP.slice(0, 8).map((k) => (
                <li key={k.id} className="flex items-center justify-between py-2 gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-700 truncate">{k.premio_titulo || '—'}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {k.cliente_nombre || '—'} · {new Date(k.created_at).toLocaleDateString('es-AR')}
                    </div>
                  </div>
                  <Badge color="red">−{puntos(k.puntos)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
