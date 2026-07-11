import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { Button, Card, Select, Badge, money, puntos } from '../components/ui'

export default function Auditoria() {
  const [searchParams] = useSearchParams()
  const [cargas, setCargas] = useState([])
  const [canjes, setCanjes] = useState([])
  const [clientes, setClientes] = useState([])
  const [comercios, setComercios] = useState([])
  const [loading, setLoading] = useState(true)
  const [clienteId, setClienteId] = useState(searchParams.get('cliente') || '')
  const [comercioId, setComercioId] = useState('')
  const [tipo, setTipo] = useState('') // '' | 'carga' | 'canje'
  const [origen, setOrigen] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  useEffect(() => {
    ;(async () => {
      const [{ data: cargData }, { data: canjData }, { data: cData }, { data: coData }] = await Promise.all([
        supabase.from('cargas').select('*').order('created_at', { ascending: false }),
        supabase.from('canjes').select('*').order('created_at', { ascending: false }),
        supabase.from('clientes').select('id, nombre, dni').order('nombre'),
        supabase.from('comercios').select('id, nombre').order('nombre'),
      ])
      setCargas(cargData || [])
      setCanjes(canjData || [])
      setClientes(cData || [])
      setComercios(coData || [])
      setLoading(false)
    })()
  }, [])

  // Movimientos unificados: cargas (suman puntos) + canjes (restan puntos)
  const movimientos = useMemo(() => {
    const cs = (cargas || []).map((c) => ({
      id: 'carga-' + c.id,
      tipo: 'carga',
      fecha: c.created_at,
      cliente_id: c.cliente_id,
      cliente_nombre: c.cliente_nombre,
      numero_tarjeta: c.numero_tarjeta,
      comercio_id: c.comercio_id,
      comercio_nombre: c.comercio_nombre,
      detalle: c.factura_numero ? `Factura ${c.factura_numero}` : 'Carga de puntos',
      importe: Number(c.factura_pesos || 0),
      puntos: Number(c.puntos || 0), // positivo
      origen: c.origen,
      usuario_email: c.usuario_email,
    }))
    const js = (canjes || []).map((k) => ({
      id: 'canje-' + k.id,
      tipo: 'canje',
      fecha: k.created_at,
      cliente_id: k.cliente_id,
      cliente_nombre: k.cliente_nombre,
      numero_tarjeta: k.numero_tarjeta,
      comercio_id: k.comercio_id || null,
      comercio_nombre: k.comercio_nombre || (k.comercio_id ? null : 'General'),
      detalle: k.premio_titulo ? `Premio: ${k.premio_titulo}` : 'Canje de premio',
      importe: null,
      puntos: -Number(k.puntos || 0), // negativo (gastados)
      origen: null,
      usuario_email: k.usuario_email,
    }))
    return [...cs, ...js].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  }, [cargas, canjes])

  const filtrados = useMemo(() => {
    return movimientos.filter((m) => {
      if (clienteId && m.cliente_id !== clienteId) return false
      if (comercioId && m.comercio_id !== comercioId) return false
      if (tipo && m.tipo !== tipo) return false
      // El filtro de origen solo aplica a cargas; si se elige un origen, los canjes quedan fuera
      if (origen && m.origen !== origen) return false
      if (desde && new Date(m.fecha) < new Date(desde + 'T00:00:00')) return false
      if (hasta && new Date(m.fecha) > new Date(hasta + 'T23:59:59')) return false
      return true
    })
  }, [movimientos, clienteId, comercioId, tipo, origen, desde, hasta])

  const totales = useMemo(() => {
    return {
      cantidad: filtrados.length,
      otorgados: filtrados.filter((m) => m.tipo === 'carga').reduce((a, m) => a + m.puntos, 0),
      canjeados: filtrados.filter((m) => m.tipo === 'canje').reduce((a, m) => a + Math.abs(m.puntos), 0),
      facturado: filtrados.filter((m) => m.tipo === 'carga').reduce((a, m) => a + (m.importe || 0), 0),
    }
  }, [filtrados])

  function exportar() {
    const filas = filtrados.map((m) => ({
      Fecha: new Date(m.fecha).toLocaleString('es-AR'),
      Tipo: m.tipo === 'carga' ? 'Carga de puntos' : 'Canje de premio',
      Cliente: m.cliente_nombre || '',
      Tarjeta: m.numero_tarjeta || '',
      Comercio: m.comercio_nombre || '',
      Detalle: m.detalle,
      Importe: m.importe != null ? m.importe : '',
      Puntos: m.puntos, // con signo: + carga, - canje
      Origen: m.origen || '',
      Usuario: m.usuario_email || '',
    }))
    const ws = XLSX.utils.json_to_sheet(filas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Auditoría')
    const nombreCli = clienteId ? clientes.find((c) => c.id === clienteId)?.nombre || 'cliente' : 'total'
    XLSX.writeFile(wb, `auditoria-general-${nombreCli}.xlsx`)
  }

  function limpiar() {
    setClienteId('')
    setComercioId('')
    setTipo('')
    setOrigen('')
    setDesde('')
    setHasta('')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-800">Auditoría general</h1>
        <Button variant="secondary" onClick={exportar} disabled={filtrados.length === 0}>
          ⬇️ Exportar Excel
        </Button>
      </div>

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 items-end">
          <Select label="Cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Todos los clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} — DNI {c.dni}
              </option>
            ))}
          </Select>
          <Select label="Comercio" value={comercioId} onChange={(e) => setComercioId(e.target.value)}>
            <option value="">Todos los comercios</option>
            {comercios.map((co) => (
              <option key={co.id} value={co.id}>
                {co.nombre}
              </option>
            ))}
          </Select>
          <Select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="carga">Cargas de puntos</option>
            <option value="canje">Canjes de premios</option>
          </Select>
          <Select
            label="Origen (cargas)"
            value={origen}
            onChange={(e) => setOrigen(e.target.value)}
            disabled={tipo === 'canje'}
          >
            <option value="">Todos</option>
            <option value="manual">Manual</option>
            <option value="api">API</option>
          </Select>
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1">Desde</span>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1">Hasta</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <Button variant="ghost" onClick={limpiar}>
            Limpiar filtros
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="text-center">
          <div className="text-sm text-slate-500">Movimientos</div>
          <div className="text-2xl font-bold text-slate-800">{puntos(totales.cantidad)}</div>
        </Card>
        <Card className="text-center">
          <div className="text-sm text-slate-500">Puntos otorgados</div>
          <div className="text-2xl font-bold text-green-600">+{puntos(totales.otorgados)}</div>
        </Card>
        <Card className="text-center">
          <div className="text-sm text-slate-500">Puntos canjeados</div>
          <div className="text-2xl font-bold text-red-600">−{puntos(totales.canjeados)}</div>
        </Card>
        <Card className="text-center">
          <div className="text-sm text-slate-500">Total facturado</div>
          <div className="text-2xl font-bold text-slate-800">{money(totales.facturado)}</div>
        </Card>
      </div>

      <Card>
        {loading ? (
          <p className="text-slate-500">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-slate-400">No hay movimientos para los filtros elegidos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Tarjeta</th>
                  <th className="py-2 pr-3">Comercio</th>
                  <th className="py-2 pr-3">Detalle</th>
                  <th className="py-2 pr-3 text-right">Importe</th>
                  <th className="py-2 pr-3 text-right">Puntos</th>
                  <th className="py-2 pr-3">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 whitespace-nowrap" data-label="Fecha">
                      {new Date(m.fecha).toLocaleString('es-AR')}
                    </td>
                    <td className="py-2 pr-3" data-label="Tipo">
                      {m.tipo === 'carga' ? (
                        <span className="inline-flex items-center gap-1">
                          <Badge color="sky">Carga</Badge>
                          {m.origen && <span className="text-xs text-slate-400">{m.origen}</span>}
                        </span>
                      ) : (
                        <Badge color="indigo">Canje</Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3" data-label="Cliente">
                      {m.cliente_nombre || '—'}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-500" data-label="Tarjeta">
                      {m.numero_tarjeta || '—'}
                    </td>
                    <td className="py-2 pr-3" data-label="Comercio">
                      {m.comercio_nombre || '—'}
                    </td>
                    <td className="py-2 pr-3" data-label="Detalle">
                      {m.detalle}
                    </td>
                    <td className="py-2 pr-3 text-right" data-label="Importe">
                      {m.importe != null ? money(m.importe) : '—'}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right font-semibold ${
                        m.puntos >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                      data-label="Puntos"
                    >
                      {m.puntos >= 0 ? '+' : '−'}
                      {puntos(Math.abs(m.puntos))}
                    </td>
                    <td className="py-2 pr-3 text-slate-500 text-xs" data-label="Usuario">
                      {m.usuario_email || '—'}
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
