import { Link, useOutletContext } from 'react-router-dom'
import { Card, Badge, puntos } from '../../components/ui'

// Paleta para el donut y las leyendas (fucsia primero, como la referencia)
const COLORES = ['#a21caf', '#10b981', '#06b6d4', '#f59e0b', '#6366f1', '#ef4444', '#84cc16', '#ec4899']

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// Tarjeta de estadística con borde violeta a la izquierda (estilo de la referencia)
function StatPortal({ label, valor, icono, to }) {
  const contenido = (
    <Card className="border-l-4 !border-l-fuchsia-700 flex items-center justify-between gap-3 hover:shadow-md transition">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-fuchsia-700">{label}</div>
        <div className="text-xl font-bold text-slate-700 truncate">{valor}</div>
      </div>
      <div className="text-3xl text-slate-300">{icono}</div>
    </Card>
  )
  return to ? <Link to={to}>{contenido}</Link> : contenido
}

// Gráfico de línea (SVG) de puntos ganados por mes del año en curso
function LineaPuntosMes({ valores }) {
  const w = 640
  const h = 220
  const pad = 34
  const max = Math.max(1, ...valores)
  const x = (i) => pad + (i * (w - 2 * pad)) / (valores.length - 1)
  const y = (v) => h - pad - (v / max) * (h - 2 * pad)
  const pts = valores.map((v, i) => [x(i), y(v)])
  const linea = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ')
  const area = `${linea} L${pts[pts.length - 1][0]},${h - pad} L${pts[0][0]},${h - pad} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Puntos ganados por mes">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line
            x1={pad}
            y1={y(max * f)}
            x2={w - pad}
            y2={y(max * f)}
            stroke="#e2e8f0"
            strokeDasharray="3 4"
          />
          <text x={pad - 8} y={y(max * f) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
            {puntos(Math.round(max * f))}
          </text>
        </g>
      ))}
      <path d={area} fill="#6366f1" opacity="0.08" />
      <path d={linea} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" />
      {pts.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r="3.5" fill="#6366f1">
          <title>{`${MESES[i]}: ${puntos(valores[i])} puntos`}</title>
        </circle>
      ))}
      {MESES.map((m, i) =>
        i % 2 === 0 ? (
          <text key={m} x={x(i)} y={h - pad + 16} textAnchor="middle" fontSize="10" fill="#94a3b8">
            {m}
          </text>
        ) : null
      )}
    </svg>
  )
}

// Donut (SVG) con la distribución de puntos disponibles por comercio
function DonutComercios({ items }) {
  const total = items.reduce((a, i) => a + i.valor, 0)
  const r = 70
  const c = 2 * Math.PI * r
  let offset = 0

  if (total <= 0) {
    return <p className="text-sm text-slate-400 text-center py-8">Todavía no tenés puntos acumulados.</p>
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 180 180" className="w-48 h-48" role="img" aria-label="Puntos por comercio">
        {items.map((item, i) => {
          const frac = item.valor / total
          const seg = (
            <circle
              key={item.label}
              cx="90"
              cy="90"
              r={r}
              fill="none"
              stroke={COLORES[i % COLORES.length]}
              strokeWidth="22"
              strokeDasharray={`${frac * c} ${c}`}
              strokeDashoffset={-offset * c}
              transform="rotate(-90 90 90)"
            >
              <title>{`${item.label}: ${puntos(item.valor)} puntos`}</title>
            </circle>
          )
          offset += frac
          return seg
        })}
      </svg>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-600">
        {items.map((item, i) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORES[i % COLORES.length] }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function PortalInicio() {
  const { datos } = useOutletContext()

  if (!datos) return <p className="text-slate-500">Cargando…</p>

  const { tarjeta, saldos = [], premios = [], solicitudes = [], cargas = [], canjes = [] } = datos

  const anio = new Date().getFullYear()
  const porMes = Array(12).fill(0)
  cargas.forEach((cg) => {
    const f = new Date(cg.created_at)
    if (f.getFullYear() === anio) porMes[f.getMonth()] += Number(cg.puntos || 0)
  })

  const paraRetirar = solicitudes.filter((s) => s.estado === 'confirmado').length
  const pendientes = solicitudes.filter((s) => ['pendiente', 'revision'].includes(s.estado)).length
  const donutItems = saldos
    .filter((s) => Number(s.remanente) > 0)
    .map((s) => ({ label: s.comercio_nombre, valor: Number(s.remanente) }))

  return (
    <div className="space-y-6">
      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatPortal label="Mis puntos" valor={puntos(tarjeta?.puntos_remanentes ?? 0)} icono="💳" to="/portal/tarjeta" />
        <StatPortal label="Catálogo de premios" valor={`${premios.length} disponibles`} icono="📖" to="/portal/catalogo" />
        <StatPortal label="Canjes realizados" valor={puntos(canjes.length)} icono="🏆" />
        <StatPortal label="Mi cuenta" valor="Datos personales" icono="📝" to="/portal/cuenta" />
      </div>

      {/* Avisos */}
      {(paraRetirar > 0 || pendientes > 0) && (
        <div className="text-center text-sm font-semibold text-fuchsia-800 bg-fuchsia-50 border border-fuchsia-200 rounded-lg px-4 py-2">
          ❗ {paraRetirar > 0 && (
            <>Tenés <b>{paraRetirar}</b> premio/s confirmado/s para retirar. </>
          )}
          {pendientes > 0 && (
            <>Tenés <b>{pendientes}</b> solicitud/es de canje en proceso.</>
          )}
        </div>
      )}

      {/* Gráficos */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <h2 className="font-semibold text-fuchsia-800 border-b border-slate-100 pb-3 mb-4">
            Tus puntos ganados ({anio})
          </h2>
          <LineaPuntosMes valores={porMes} />
        </Card>
        <Card>
          <h2 className="font-semibold text-fuchsia-800 border-b border-slate-100 pb-3 mb-4">
            Puntos por comercio
          </h2>
          <DonutComercios items={donutItems} />
        </Card>
      </div>

      {/* Detalle por comercio */}
      <Card>
        <h2 className="font-semibold text-fuchsia-800 border-b border-slate-100 pb-3 mb-4">
          Detalle por comercio
        </h2>
        {saldos.length === 0 ? (
          <p className="text-sm text-slate-400">Todavía no tenés movimientos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Comercio</th>
                  <th className="py-2 pr-3 text-right">Saldo</th>
                  <th className="py-2 pr-3 text-right">En canjes pendientes</th>
                  <th className="py-2 pr-3 text-right">Disponible</th>
                </tr>
              </thead>
              <tbody>
                {saldos.map((s) => (
                  <tr key={s.comercio_id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-700" data-label="Comercio">
                      {s.comercio_nombre}
                    </td>
                    <td className="py-2 pr-3 text-right" data-label="Saldo">
                      {puntos(s.saldo)}
                    </td>
                    <td className="py-2 pr-3 text-right text-amber-600" data-label="En canjes pendientes">
                      {puntos(s.pendiente)}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold text-green-600" data-label="Disponible">
                      {puntos(s.remanente)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Últimos movimientos */}
      <Card>
        <h2 className="font-semibold text-fuchsia-800 border-b border-slate-100 pb-3 mb-4">
          Últimos movimientos
        </h2>
        <UltimosMovimientos cargas={cargas} canjes={canjes} />
      </Card>
    </div>
  )
}

function UltimosMovimientos({ cargas, canjes }) {
  const movs = [
    ...cargas.map((c) => ({
      id: 'c' + c.created_at + (c.factura_numero || ''),
      fecha: c.created_at,
      detalle: c.factura_numero ? `Compra — Factura ${c.factura_numero}` : 'Carga de puntos',
      comercio: c.comercio_nombre,
      puntos: Number(c.puntos || 0),
    })),
    ...canjes.map((k) => ({
      id: 'k' + k.created_at + (k.premio_titulo || ''),
      fecha: k.created_at,
      detalle: `Canje — ${k.premio_titulo || 'Premio'}`,
      comercio: k.comercio_nombre || 'General',
      puntos: -Number(k.puntos || 0),
    })),
  ]
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 10)

  if (movs.length === 0) return <p className="text-sm text-slate-400">Todavía no tenés movimientos.</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm responsive-table">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="py-2 pr-3">Fecha</th>
            <th className="py-2 pr-3">Detalle</th>
            <th className="py-2 pr-3">Comercio</th>
            <th className="py-2 pr-3 text-right">Puntos</th>
          </tr>
        </thead>
        <tbody>
          {movs.map((m) => (
            <tr key={m.id} className="border-b border-slate-100">
              <td className="py-2 pr-3 whitespace-nowrap" data-label="Fecha">
                {new Date(m.fecha).toLocaleDateString('es-AR')}
              </td>
              <td className="py-2 pr-3" data-label="Detalle">
                {m.detalle}
              </td>
              <td className="py-2 pr-3" data-label="Comercio">
                {m.comercio ? <Badge color="slate">{m.comercio}</Badge> : '—'}
              </td>
              <td
                className={`py-2 pr-3 text-right font-semibold ${m.puntos >= 0 ? 'text-green-600' : 'text-red-600'}`}
                data-label="Puntos"
              >
                {m.puntos >= 0 ? '+' : '−'}
                {puntos(Math.abs(m.puntos))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
