import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Card, Stat, Badge, Select, money, puntos, formatTarjeta } from '../components/ui'

const PERIODOS = [
  { label: 'Últimos 7 días', dias: 7 },
  { label: 'Últimos 30 días', dias: 30 },
  { label: 'Últimos 90 días', dias: 90 },
  { label: 'Último año', dias: 365 },
  { label: 'Todo el historial', dias: 0 },
]

function porMesDesde(items, getFecha, getValor) {
  const map = new Map()
  items.forEach((it) => {
    const d = new Date(getFecha(it))
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    map.set(key, (map.get(key) || 0) + Number(getValor(it) || 0))
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
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [dias, setDias] = useState(30)
  const [comercioSel, setComercioSel] = useState('') // '' = general
  const [clientesCount, setClientesCount] = useState(0)
  const [tarjetas, setTarjetas] = useState([])
  const [cargas, setCargas] = useState([])
  const [canjes, setCanjes] = useState([])
  const [detalle, setDetalle] = useState([])
  const [premios, setPremios] = useState([])
  const [comercios, setComercios] = useState([])
  const [pxp, setPxp] = useState(1000)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [
        { count: cCount },
        { data: tData },
        { data: cargData },
        { data: canjData },
        { data: detData },
        { data: pData },
        { data: coData },
        { data: cfg },
      ] = await Promise.all([
        supabase.from('clientes').select('id', { count: 'exact', head: true }),
        supabase.from('tarjetas').select('id, numero, puntos, activa, cliente_id, clientes(nombre)'),
        supabase.from('cargas').select('*').order('created_at', { ascending: false }),
        supabase.from('canjes').select('*').order('created_at', { ascending: false }),
        supabase.from('canje_detalle').select('canje_id, comercio_id, puntos, canjes(cliente_id, created_at)'),
        supabase.from('premios').select('id, activo, stock, comercio_id'),
        supabase.from('comercios').select('id, nombre').order('nombre'),
        supabase.from('config').select('pesos_por_punto').eq('id', 1).single(),
      ])
      if (!vivo) return
      setClientesCount(cCount || 0)
      setTarjetas(tData || [])
      setCargas(cargData || [])
      setCanjes(canjData || [])
      setDetalle(detData || [])
      setPremios(pData || [])
      setComercios(coData || [])
      if (cfg?.pesos_por_punto) setPxp(Number(cfg.pesos_por_punto))
      setLoading(false)
    })()
    return () => {
      vivo = false
    }
  }, [])

  // Nombre/tarjeta por cliente (para el ranking por comercio)
  const infoCliente = useMemo(() => {
    const m = new Map()
    tarjetas.forEach((t) => m.set(t.cliente_id, { nombre: t.clientes?.nombre || '—', numero: t.numero }))
    return m
  }, [tarjetas])

  const v = useMemo(() => {
    const corte = dias ? Date.now() - dias * 86400000 : null
    const inPeriodo = (f) => !corte || new Date(f).getTime() >= corte
    const esGeneral = !comercioSel

    // Datasets según comercio
    const cargasSel = esGeneral ? cargas : cargas.filter((c) => c.comercio_id === comercioSel)
    const detSel = esGeneral ? detalle : detalle.filter((d) => d.comercio_id === comercioSel)
    const cargasP = cargasSel.filter((c) => inPeriodo(c.created_at))
    const detP = detSel.filter((d) => inPeriodo(d.canjes?.created_at))
    const canjesP = canjes.filter((k) => inPeriodo(k.created_at))

    // Métricas de flujo (período)
    const puntosOtorgados = cargasP.reduce((a, c) => a + Number(c.puntos || 0), 0)
    const facturado = cargasP.reduce((a, c) => a + Number(c.factura_pesos || 0), 0)
    const manual = cargasP.filter((c) => c.origen === 'manual').length
    const api = cargasP.filter((c) => c.origen === 'api').length

    let puntosCanjeados, canjesCount, canjesLista
    if (esGeneral) {
      puntosCanjeados = canjesP.reduce((a, k) => a + Number(k.puntos || 0), 0)
      canjesCount = canjesP.length
      canjesLista = canjesP
    } else {
      // Puntos consumidos desde este comercio (incluye la parte de premios generales)
      puntosCanjeados = detP.reduce((a, d) => a + Number(d.puntos || 0), 0)
      const ids = new Set(detP.map((d) => d.canje_id))
      canjesCount = ids.size
      canjesLista = canjesP.filter((k) => ids.has(k.id))
    }

    // Métricas de estado actual
    let puntosCirculacion, clientes, tarjetasActivasLabel, tarjetasActivasValue, tarjetasSub
    if (esGeneral) {
      puntosCirculacion = tarjetas.reduce((a, t) => a + Number(t.puntos || 0), 0)
      clientes = clientesCount
      tarjetasActivasLabel = 'Tarjetas activas'
      tarjetasActivasValue = tarjetas.filter((t) => t.activa).length
      tarjetasSub = `${tarjetas.length} en total`
    } else {
      // Circulación en el comercio = todas las cargas del comercio − todo lo consumido del comercio
      const otorgadoTotal = cargasSel.reduce((a, c) => a + Number(c.puntos || 0), 0)
      const consumidoTotal = detSel.reduce((a, d) => a + Number(d.puntos || 0), 0)
      puntosCirculacion = otorgadoTotal - consumidoTotal
      clientes = new Set(cargasSel.map((c) => c.cliente_id)).size
      tarjetasActivasLabel = 'Clientes con actividad'
      tarjetasActivasValue = clientes
      tarjetasSub = 'en este comercio'
    }

    // Premios (catálogo)
    const premiosSel = esGeneral ? premios : premios.filter((p) => p.comercio_id === comercioSel)
    const premiosCatalogo = premiosSel.length
    const premiosActivos = premiosSel.filter((p) => p.activo).length
    const stockDisponible = premiosSel.reduce((a, p) => a + Number(p.stock || 0), 0)

    // Top clientes por puntos
    let topClientes
    if (esGeneral) {
      topClientes = [...tarjetas]
        .sort((a, b) => Number(b.puntos) - Number(a.puntos))
        .slice(0, 5)
        .map((t) => ({ nombre: t.clientes?.nombre || '—', numero: t.numero, puntos: Number(t.puntos || 0) }))
    } else {
      const saldo = new Map()
      cargasSel.forEach((c) => saldo.set(c.cliente_id, (saldo.get(c.cliente_id) || 0) + Number(c.puntos || 0)))
      detSel.forEach((d) => {
        const cid = d.canjes?.cliente_id
        if (cid) saldo.set(cid, (saldo.get(cid) || 0) - Number(d.puntos || 0))
      })
      topClientes = [...saldo.entries()]
        .map(([cid, pts]) => ({
          nombre: infoCliente.get(cid)?.nombre || '—',
          numero: infoCliente.get(cid)?.numero || '',
          puntos: pts,
        }))
        .sort((a, b) => b.puntos - a.puntos)
        .slice(0, 5)
    }

    // Top premios
    const premiosMap = new Map()
    canjesLista.forEach((k) => {
      const key = k.premio_titulo || '—'
      const cur = premiosMap.get(key) || { titulo: key, cantidad: 0, puntos: 0 }
      cur.cantidad += 1
      cur.puntos += Number(k.puntos || 0)
      premiosMap.set(key, cur)
    })
    const topPremios = [...premiosMap.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 5)

    const porMes = porMesDesde(cargasP, (c) => c.created_at, (c) => c.puntos)

    return {
      esGeneral,
      puntosOtorgados,
      facturado,
      manual,
      api,
      cargasCount: cargasP.length,
      puntosCanjeados,
      canjesCount,
      puntosCirculacion,
      clientes,
      tarjetasActivasLabel,
      tarjetasActivasValue,
      tarjetasSub,
      premiosCatalogo,
      premiosActivos,
      stockDisponible,
      topClientes,
      topPremios,
      porMes,
      canjesLista: canjesLista.slice(0, 8),
    }
  }, [cargas, canjes, detalle, tarjetas, premios, clientesCount, infoCliente, dias, comercioSel])

  if (loading) return <div className="text-slate-500">Cargando estadísticas…</div>

  const comercioNombre = comercios.find((c) => c.id === comercioSel)?.nombre

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500">Vista:</label>
            <Select value={comercioSel} onChange={(e) => setComercioSel(e.target.value)} className="text-sm">
              <option value="">General (todos los comercios)</option>
              {comercios.map((co) => (
                <option key={co.id} value={co.id}>
                  {co.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500">Período:</label>
            <Select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="text-sm">
              {PERIODOS.map((p) => (
                <option key={p.dias} value={p.dias}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-400 -mt-2">
        {v.esGeneral ? (
          <>Estadística <b>general</b> (todos los comercios).</>
        ) : (
          <>Estadística del comercio <b>{comercioNombre}</b>.</>
        )}{' '}
        Cargas, canjes y facturación de <b>{dias > 0 ? `los últimos ${dias} días` : 'todo el historial'}</b>; el
        resto es estado actual. Equivalencia: <b>{money(pxp)}</b> = 1 punto.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label={v.esGeneral ? 'Clientes' : 'Clientes con actividad'} value={puntos(v.clientes)} icon="👥" color="indigo" />
        <Stat
          label={v.tarjetasActivasLabel}
          value={puntos(v.tarjetasActivasValue)}
          sub={v.tarjetasSub}
          icon="💳"
          color="sky"
        />
        <Stat label="Puntos en circulación" value={puntos(v.puntosCirculacion)} icon="⭐" color="amber" />
        <Stat
          label="Puntos otorgados"
          value={puntos(v.puntosOtorgados)}
          sub={`${v.cargasCount} cargas en el período`}
          icon="📈"
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Total facturado" value={money(v.facturado)} icon="🧾" color="violet" />
        <Stat label="Cargas manuales" value={puntos(v.manual)} icon="✍️" color="sky" />
        <Stat label="Cargas por API" value={puntos(v.api)} icon="🔌" color="green" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Canjes realizados" value={puntos(v.canjesCount)} icon="🎉" color="violet" />
        <Stat
          label={v.esGeneral ? 'Puntos canjeados' : 'Puntos canjeados (desde este comercio)'}
          value={puntos(v.puntosCanjeados)}
          icon="🎁"
          color="amber"
        />
        <Stat
          label={v.esGeneral ? 'Premios en catálogo' : 'Premios de este comercio'}
          value={puntos(v.premiosCatalogo)}
          sub={`${v.premiosActivos} activos`}
          icon="🏷️"
          color="indigo"
        />
        <Stat label="Stock disponible" value={puntos(v.stockDisponible)} icon="📦" color="sky" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="font-semibold text-slate-700 mb-4">Puntos otorgados por mes</h2>
          {v.porMes.length === 0 ? (
            <p className="text-sm text-slate-400">No hay cargas en el período elegido.</p>
          ) : (
            <div className="flex items-end gap-3 h-48">
              {v.porMes.map((b) => (
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

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700">
              Top clientes por puntos {v.esGeneral ? '' : '(en este comercio)'}
            </h2>
            <Link to="/clientes" className="text-sm text-indigo-600 hover:underline">
              Ver todos
            </Link>
          </div>
          {v.topClientes.length === 0 ? (
            <p className="text-sm text-slate-400">Sin datos.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {v.topClientes.map((t, i) => (
                <li key={i} className="flex items-center justify-between py-2 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-slate-400 font-semibold w-5 text-center">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="font-medium text-slate-700 truncate">{t.nombre}</div>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700">Top premios más canjeados</h2>
            <Link to="/premios" className="text-sm text-indigo-600 hover:underline">
              Ver catálogo
            </Link>
          </div>
          {v.topPremios.length === 0 ? (
            <p className="text-sm text-slate-400">No hay canjes en el período elegido.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {v.topPremios.map((p, i) => (
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
          {v.canjesLista.length === 0 ? (
            <p className="text-sm text-slate-400">Sin canjes en el período elegido.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {v.canjesLista.map((k) => (
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
