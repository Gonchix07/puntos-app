import { useCallback, useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { usePortal } from '../contexts/PortalAuthContext'
import { puntos } from './ui'
import MarcaPuntos from './MarcaPuntos'

// Layout del portal de clientes: sidebar oscura a la izquierda + barra
// superior con degradado violeta (estética "shopping premium").

// Íconos monocromo (trazo, heredan el color del texto vía currentColor)
const PATHS = {
  inicio:
    'M2.25 12 11.204 3.045c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75',
  catalogo:
    'M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25',
  tarjeta:
    'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z',
  cuenta:
    'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10',
  salir:
    'M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9',
}

function Icono({ nombre, className = 'h-5 w-5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <path d={PATHS[nombre]} />
    </svg>
  )
}

const ITEMS = [
  { to: '/portal', icono: 'inicio', label: 'Inicio', end: true },
  { to: '/portal/catalogo', icono: 'catalogo', label: 'Catálogo' },
  { to: '/portal/tarjeta', icono: 'tarjeta', label: 'Tarjeta Virtual' },
  { to: '/portal/cuenta', icono: 'cuenta', label: 'Mi cuenta' },
]

export default function PortalLayout() {
  const { token, nombre, cerrarSesion, api } = usePortal()
  const navigate = useNavigate()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [menuAbierto, setMenuAbierto] = useState(false)

  const recargar = useCallback(async () => {
    try {
      setError('')
      const d = await api('/api/portal-datos')
      setDatos(d)
    } catch (e) {
      setError(e.message)
    }
  }, [api])

  useEffect(() => {
    if (token) recargar()
  }, [token, recargar])

  if (!token) return <Navigate to="/portal/login" replace />

  function salir() {
    cerrarSesion()
    navigate('/portal/login', { replace: true })
  }

  const primerNombre = (nombre || datos?.cliente?.nombre || '').split(' ')[0]

  const sidebar = (
    <aside className="w-60 shrink-0 bg-[#2b2a33] text-slate-300 flex flex-col h-full min-h-screen">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
        <Icono nombre="tarjeta" className="h-8 w-8 text-fuchsia-500" />
        <span className="font-bold text-white uppercase leading-tight">
          Hola {primerNombre || 'cliente'}!
        </span>
      </div>
      <div className="px-5 py-3 text-sm tracking-wide border-b border-white/10">
        <span className="text-slate-400 uppercase">Puntos</span>{' '}
        <span className="text-white font-bold">{puntos(datos?.tarjeta?.puntos_remanentes ?? 0)}</span>
      </div>
      <nav className="flex-1 py-2">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMenuAbierto(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-5 py-3 text-sm transition hover:bg-white/10 hover:text-white ${
                isActive ? 'bg-white/10 text-white border-l-4 border-fuchsia-500 pl-4' : ''
              }`
            }
          >
            <Icono nombre={item.icono} /> {item.label}
          </NavLink>
        ))}
        <button
          onClick={salir}
          className="w-full flex items-center gap-3 px-5 py-3 text-sm transition hover:bg-white/10 hover:text-white text-left"
        >
          <Icono nombre="salir" /> Cerrar sesión
        </button>
      </nav>
      <div className="px-5 py-4 text-xs text-slate-500 border-t border-white/10">
        Programa de Puntos · Portal de clientes
      </div>
    </aside>
  )

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* Sidebar fija en desktop */}
      <div className="hidden lg:block">{sidebar}</div>

      {/* Sidebar como overlay en mobile */}
      {menuAbierto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuAbierto(false)} />
          <div className="absolute inset-y-0 left-0 z-50">{sidebar}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Barra superior con degradado violeta */}
        <header className="bg-gradient-to-r from-violet-950 via-purple-800 to-fuchsia-700 text-white">
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden text-2xl leading-none"
                onClick={() => setMenuAbierto(true)}
                aria-label="Abrir menú"
              >
                ☰
              </button>
              <MarcaPuntos />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="hidden sm:inline">{nombre || datos?.cliente?.nombre}</span>
              <span className="star-anim">⭐</span>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 py-6">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
          )}
          <Outlet context={{ datos, recargar, api }} />
        </main>
      </div>
    </div>
  )
}
