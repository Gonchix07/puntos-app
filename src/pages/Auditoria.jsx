import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { Button, Card, Select, Badge, money, puntos } from '../components/ui'

export default function Auditoria() {
  const [cargas, setCargas] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [clienteId, setClienteId] = useState('')
  const [origen, setOrigen] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  useEffect(() => {
    ;(async () => {
      const [{ data: cargData }, { data: cData }] = await Promise.all([
        supabase.from('cargas').select('*').order('created_at', { ascending: false }),
        supabase.from('clientes').select('id, nombre, dni').order('nombre'),
      ])
      setCargas(cargData || [])
      setClientes(cData || [])
      setLoading(false)
    })()
  }, [])

  const filtradas = useMemo(() => {
    return cargas.filter((c) => {
      if (clienteId && c.cliente_id !== clienteId) return false
      if (origen && c.origen !== origen) return false
      if (desde && new Date(c.created_at) < new Date(desde + 'T00:00:00')) return false
      if (hasta && new Date(c.created_at) > new Date(hasta + 'T23:59:59')) return false
      return true
    })
  }, [cargas, clienteId, origen, desde, hasta])

  const totales = useMemo(() => {
    return {
      cantidad: filtradas.length,
      puntos: filtradas.reduce((a, c) => a + Number(c.puntos || 0), 0),
      facturado: filtradas.reduce((a, c) => a + Number(c.factura_pesos || 0), 0),
    }
  }, [filtradas])

  function exportar() {
    const filas = filtradas.map((c) => ({
      Fecha: new Date(c.created_at).toLocaleString('es-AR'),
      Cliente: c.cliente_nombre || '',
      Tarjeta: c.numero_tarjeta || '',
      'N° Factura': c.factura_numero || '',
      Importe: Number(c.factura_pesos || 0),
      '$/Punto': Number(c.pesos_por_punto || 0),
      Puntos: Number(c.puntos || 0),
      Origen: c.origen,
      Usuario: c.usuario_email || '',
    }))
    const ws = XLSX.utils.json_to_sheet(filas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Auditoría')
    const nombreCli = clienteId ? clientes.find((c) => c.id === clienteId)?.nombre || 'cliente' : 'total'
    XLSX.writeFile(wb, `auditoria-puntos-${nombreCli}.xlsx`)
  }

  function limpiar() {
    setClienteId('')
    setOrigen('')
    setDesde('')
    setHasta('')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-800">Auditoría de carga de puntos</h1>
        <Button variant="secondary" onClick={exportar} disabled={filtradas.length === 0}>
          ⬇️ Exportar Excel
        </Button>
      </div>

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <Select label="Cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Todos los clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} — DNI {c.dni}
              </option>
            ))}
          </Select>
          <Select label="Origen" value={origen} onChange={(e) => setOrigen(e.target.value)}>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="text-center">
          <div className="text-sm text-slate-500">Cargas</div>
          <div className="text-2xl font-bold text-slate-800">{puntos(totales.cantidad)}</div>
        </Card>
        <Card className="text-center">
          <div className="text-sm text-slate-500">Puntos otorgados</div>
          <div className="text-2xl font-bold text-amber-600">⭐ {puntos(totales.puntos)}</div>
        </Card>
        <Card className="text-center">
          <div className="text-sm text-slate-500">Total facturado</div>
          <div className="text-2xl font-bold text-slate-800">{money(totales.facturado)}</div>
        </Card>
      </div>

      <Card>
        {loading ? (
          <p className="text-slate-500">Cargando…</p>
        ) : filtradas.length === 0 ? (
          <p className="text-sm text-slate-400">No hay cargas para los filtros elegidos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Tarjeta</th>
                  <th className="py-2 pr-3">Factura</th>
                  <th className="py-2 pr-3 text-right">Importe</th>
                  <th className="py-2 pr-3 text-right">Puntos</th>
                  <th className="py-2 pr-3">Origen</th>
                  <th className="py-2 pr-3">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 whitespace-nowrap" data-label="Fecha">
                      {new Date(c.created_at).toLocaleString('es-AR')}
                    </td>
                    <td className="py-2 pr-3" data-label="Cliente">
                      {c.cliente_nombre || '—'}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-500" data-label="Tarjeta">
                      {c.numero_tarjeta || '—'}
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
                    <td className="py-2 pr-3 text-slate-500 text-xs" data-label="Usuario">
                      {c.usuario_email || '—'}
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
