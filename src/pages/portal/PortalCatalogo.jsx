import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button, Card, Badge, puntos } from '../../components/ui'

const ESTADOS = {
  pendiente: { label: 'Pendiente', color: 'amber' },
  revision: { label: 'En revisión', color: 'sky' },
  confirmado: { label: 'Confirmado — a retirar', color: 'indigo' },
  entregado: { label: 'Entregado', color: 'green' },
  rechazada: { label: 'Rechazada', color: 'red' },
}

// Pill de comercio (con logo) o "General" — mismo esquema que la vista de premios del alta
function ComercioPill({ comercioId, nombre, logo }) {
  if (!comercioId) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
        🌐 General
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
      {logo ? (
        <img src={logo} alt="" className="h-4 w-4 rounded-sm object-contain bg-white" />
      ) : (
        '🏬'
      )}
      {nombre || 'Comercio'}
    </span>
  )
}

export default function PortalCatalogo() {
  const { datos, recargar, api } = useOutletContext()
  const [msg, setMsg] = useState(null)
  const [canjeando, setCanjeando] = useState(null) // id del premio en proceso
  const [confirmar, setConfirmar] = useState(null) // premio elegido, pendiente de confirmación

  if (!datos) return <p className="text-slate-500">Cargando…</p>

  const { premios, solicitudes, tarjeta } = datos
  const disponibles = Number(tarjeta?.puntos_remanentes ?? 0)

  async function canjear(premio) {
    setConfirmar(null)
    setMsg(null)
    setCanjeando(premio.id)
    try {
      await api('/api/portal-datos', {
        method: 'POST',
        body: JSON.stringify({ action: 'canjear', premio_id: premio.id }),
      })
      setMsg({
        tipo: 'ok',
        texto: `¡Listo! Tu solicitud de canje de "${premio.titulo}" quedó registrada. Te avisaremos cuando esté confirmada.`,
      })
      recargar()
    } catch (e) {
      setMsg({ tipo: 'error', texto: e.message })
    } finally {
      setCanjeando(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-800">Catálogo de premios</h1>
        <Badge color="amber">⭐ Tenés {puntos(disponibles)} puntos disponibles</Badge>
      </div>

      {msg && (
        <div
          className={`rounded-lg px-4 py-2 text-sm ${
            msg.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {msg.texto}
        </div>
      )}

      {premios.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400">Por el momento no hay premios disponibles.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {premios.map((p) => {
            const alcanza = disponibles >= Number(p.puntos_necesarios)
            const sinStock = p.stock <= 0
            return (
              <Card key={p.id} className="relative flex flex-col p-0 overflow-hidden min-h-[340px]">
                {/* Imagen de fondo (ocupa toda la tarjeta) */}
                {p.foto_url ? (
                  <img src={p.foto_url} alt={p.titulo} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 grid place-items-center bg-slate-100 text-6xl">🎁</div>
                )}
                {/* Degradado para que el texto se lea sobre la foto */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

                {/* Contenido apoyado abajo, sin fondo blanco */}
                <div className="relative mt-auto p-4 flex flex-col gap-2 text-white">
                  <h3 className="font-semibold text-white drop-shadow-sm">{p.titulo}</h3>
                  {p.descripcion && (
                    <p className="text-sm text-white/85 line-clamp-2 drop-shadow-sm">{p.descripcion}</p>
                  )}
                  <div>
                    <ComercioPill
                      comercioId={p.comercio_id}
                      nombre={p.comercio?.nombre}
                      logo={p.comercio?.logo_url}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge color="amber">⭐ {puntos(p.puntos_necesarios)} pts</Badge>
                    <span
                      className={`text-xs font-semibold drop-shadow-sm ${
                        sinStock ? 'text-red-300' : 'text-white/90'
                      }`}
                    >
                      {sinStock ? 'Sin stock' : `Stock: ${p.stock}`}
                    </span>
                  </div>
                  <Button
                    className="w-full !bg-fuchsia-700 hover:!bg-fuchsia-800"
                    disabled={!alcanza || sinStock || canjeando === p.id}
                    onClick={() => setConfirmar(p)}
                    title={alcanza ? 'Solicitar canje' : 'No te alcanzan los puntos disponibles'}
                  >
                    {canjeando === p.id ? 'Canjeando…' : alcanza ? 'Solicitar canje' : 'Te faltan puntos'}
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Confirmación de canje */}
      {confirmar && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4" onClick={() => setConfirmar(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-2">Confirmar canje</h3>
            <p className="text-sm text-slate-600 mb-4">
              Vas a solicitar el canje de <b>{confirmar.titulo}</b> por{' '}
              <b>⭐ {puntos(confirmar.puntos_necesarios)}</b> puntos. Los puntos quedan reservados hasta que el
              comercio confirme la entrega. ¿Continuamos?
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setConfirmar(null)}>
                Cancelar
              </Button>
              <Button className="!bg-fuchsia-700 hover:!bg-fuchsia-800" onClick={() => canjear(confirmar)}>
                Sí, canjear
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Mis solicitudes */}
      <Card>
        <h2 className="font-semibold text-fuchsia-800 border-b border-slate-100 pb-3 mb-4">Mis canjes</h2>
        {solicitudes.length === 0 ? (
          <p className="text-sm text-slate-400">Todavía no solicitaste ningún canje.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Premio</th>
                  <th className="py-2 pr-3">Comercio</th>
                  <th className="py-2 pr-3 text-right">Puntos</th>
                  <th className="py-2 pr-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {solicitudes.map((s) => {
                  const est = ESTADOS[s.estado] || { label: s.estado, color: 'slate' }
                  return (
                    <tr key={s.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 whitespace-nowrap" data-label="Fecha">
                        {new Date(s.created_at).toLocaleDateString('es-AR')}
                      </td>
                      <td className="py-2 pr-3 font-medium text-slate-700" data-label="Premio">
                        {s.premio_titulo}
                      </td>
                      <td className="py-2 pr-3" data-label="Comercio">
                        {s.comercio_nombre || 'General'}
                      </td>
                      <td className="py-2 pr-3 text-right" data-label="Puntos">
                        {puntos(s.puntos)}
                      </td>
                      <td className="py-2 pr-3" data-label="Estado">
                        <Badge color={est.color}>{est.label}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
