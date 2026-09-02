import { useOutletContext } from 'react-router-dom'
import { Card } from '../../components/ui'

function formatFecha(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const DIAS_LABEL = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' }
const PERIODICIDAD_LABEL = {
  diaria: '1 vez por día',
  semanal: '1 vez por semana',
  mensual: '1 vez por mes',
}
const YA_USADO_LABEL = {
  diaria: 'Ya lo usaste hoy',
  semanal: 'Ya lo usaste esta semana',
  mensual: 'Ya lo usaste este mes',
}

function formatDias(dias) {
  if (!dias || dias.length === 0) return null
  return [...dias].sort().map((d) => DIAS_LABEL[d]).join(', ')
}

// Motivo por el que hoy no se puede usar (si corresponde)
function motivoNoDisponible(c) {
  if (!c.dia_habilitado) return 'No disponible hoy'
  if (!c.periodicidad_disponible) return YA_USADO_LABEL[c.periodicidad] || 'Ya alcanzaste el límite de uso'
  return null
}

export default function PortalBeneficios() {
  const { datos } = useOutletContext()

  if (!datos) return <p className="text-slate-500">Cargando…</p>

  // Las disponibles ahora primero; las tuyas pero no usables hoy, al final.
  const campanias = [...(datos.campanias || [])].sort(
    (a, b) => Number(b.disponible) - Number(a.disponible)
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Beneficios</h1>
        <p className="text-sm text-slate-500">
          Descuentos asignados a tu cuenta. Los que no se pueden usar hoy quedan igual visibles, en tonos
          más claros.
        </p>
      </div>

      {campanias.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400">Por el momento no tenés beneficios asignados.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campanias.map((c) => {
            const motivo = c.disponible ? null : motivoNoDisponible(c)
            return (
              <Card
                key={c.id}
                className={`relative flex flex-col p-0 overflow-hidden min-h-[200px] ${
                  c.disponible
                    ? 'border-0 bg-gradient-to-br from-violet-950 via-purple-800 to-fuchsia-700'
                    : 'border border-purple-200 bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-50'
                }`}
              >
                <div className={`relative p-5 flex flex-col gap-3 h-full ${c.disponible ? 'text-white' : 'text-slate-700'}`}>
                  {motivo && (
                    <span className="absolute top-3 right-3 bg-slate-700/90 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">
                      {motivo}
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-3 pr-2">
                    <h3 className="font-bold text-lg leading-tight">{c.nombre}</h3>
                    <span
                      className={`shrink-0 font-extrabold text-xl leading-none rounded-full h-14 w-14 grid place-items-center shadow-lg ${
                        c.disponible ? 'bg-white text-fuchsia-700' : 'bg-white text-purple-400'
                      }`}
                    >
                      {c.descuento_porcentaje}%
                    </span>
                  </div>
                  {c.descripcion && (
                    <p className={`text-sm ${c.disponible ? 'text-white/85' : 'text-slate-500'}`}>
                      {c.descripcion}
                    </p>
                  )}
                  <div
                    className={`mt-auto flex flex-wrap items-center gap-2 pt-2 border-t text-xs ${
                      c.disponible ? 'border-white/15 text-white/80' : 'border-purple-200 text-slate-500'
                    }`}
                  >
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium ${
                        c.disponible ? 'bg-white/15' : 'bg-white text-slate-600'
                      }`}
                    >
                      {c.local ? `🏬 ${c.local}` : '🌐 Todos los locales'}
                    </span>
                    {c.fecha_hasta && <span>Válido hasta {formatFecha(c.fecha_hasta)}</span>}
                    {formatDias(c.dias_semana) && <span>· {formatDias(c.dias_semana)}</span>}
                    {c.periodicidad && c.periodicidad !== 'ilimitado' && (
                      <span>· {PERIODICIDAD_LABEL[c.periodicidad] || c.periodicidad}</span>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
