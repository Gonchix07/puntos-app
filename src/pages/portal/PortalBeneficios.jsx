import { useOutletContext } from 'react-router-dom'
import { Card } from '../../components/ui'

export default function PortalBeneficios() {
  const { datos } = useOutletContext()

  if (!datos) return <p className="text-slate-500">Cargando…</p>

  const campanias = datos.campanias || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Beneficios</h1>
        <p className="text-sm text-slate-500">Descuentos vigentes que podés usar en tus próximas compras.</p>
      </div>

      {campanias.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400">Por el momento no tenés beneficios activos.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campanias.map((c) => (
            <Card
              key={c.id}
              className="relative flex flex-col p-0 overflow-hidden min-h-[200px] bg-gradient-to-br from-violet-950 via-purple-800 to-fuchsia-700 border-0"
            >
              <div className="relative p-5 flex flex-col gap-3 text-white h-full">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-bold text-lg leading-tight">{c.nombre}</h3>
                  <span className="shrink-0 bg-white text-fuchsia-700 font-extrabold text-xl leading-none rounded-full h-14 w-14 grid place-items-center shadow-lg">
                    {c.descuento_porcentaje}%
                  </span>
                </div>
                {c.descripcion && <p className="text-sm text-white/85">{c.descripcion}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 border-t border-white/15 text-xs text-white/80">
                  <span className="inline-flex items-center gap-1 bg-white/15 px-2 py-1 rounded-full font-medium">
                    {c.local ? `🏬 ${c.local}` : '🌐 Todos los locales'}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
