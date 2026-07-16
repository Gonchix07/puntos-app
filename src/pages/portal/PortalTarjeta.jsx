import { useOutletContext } from 'react-router-dom'
import { Card, Badge, puntos, formatTarjeta } from '../../components/ui'
import MarcaPuntos from '../../components/MarcaPuntos'

// Tarjeta virtual del cliente: representación visual estilo tarjeta física.
export default function PortalTarjeta() {
  const { datos } = useOutletContext()

  if (!datos) return <p className="text-slate-500">Cargando…</p>

  const { cliente, tarjeta } = datos

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Mi tarjeta virtual</h1>

      <div className="max-w-md">
        <div className="relative rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br from-violet-950 via-purple-800 to-fuchsia-700 text-white aspect-[8/5] p-6 flex flex-col justify-between">
          {/* Brillo decorativo */}
          <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-white/10" />
          <div className="absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-white/5" />

          <div className="flex items-start justify-between relative">
            <MarcaPuntos chica />
            <span className="text-3xl">🎁</span>
          </div>

          <div className="relative space-y-3">
            <div className="font-mono text-xl sm:text-2xl tracking-widest drop-shadow">
              {tarjeta ? formatTarjeta(tarjeta.numero) : '—'}
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-fuchsia-200">Titular</div>
                <div className="font-semibold uppercase text-sm">{cliente?.nombre}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-fuchsia-200">Puntos</div>
                <div className="font-bold text-lg">⭐ {puntos(tarjeta?.puntos_remanentes ?? 0)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Card className="max-w-md">
        <h2 className="font-semibold text-fuchsia-800 border-b border-slate-100 pb-3 mb-4">Detalle</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Número</dt>
            <dd className="font-mono text-slate-700">{tarjeta ? formatTarjeta(tarjeta.numero) : '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Puntos acumulados</dt>
            <dd className="font-semibold text-slate-700">{puntos(tarjeta?.puntos ?? 0)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Puntos disponibles</dt>
            <dd className="font-semibold text-green-600">{puntos(tarjeta?.puntos_remanentes ?? 0)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Estado</dt>
            <dd>
              <Badge color={tarjeta?.activa ? 'green' : 'red'}>{tarjeta?.activa ? 'Activa' : 'Inactiva'}</Badge>
            </dd>
          </div>
        </dl>
        <p className="text-xs text-slate-400 mt-4">
          Presentá el número de tu tarjeta (o tu DNI) en el comercio para sumar puntos con tus compras.
        </p>
      </Card>
    </div>
  )
}
