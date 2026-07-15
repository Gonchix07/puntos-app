import { useCallback, useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { usePortal } from '../contexts/PortalAuthContext'
import { puntos } from './ui'

// Layout del portal de clientes: sidebar oscura a la izquierda + barra
// superior con degradado violeta (estética "shopping premium").

const ITEMS = [
  { to: '/portal', icono: '🏠', label: 'Inicio', end: true },
  { to: '/portal/catalogo', icono: '📖', label: 'Catálogo' },
  { to: '/portal/tarjeta', icono: '💳', label: 'Tarjeta Virtual' },
  { to: '/portal/cuenta', icono: '📝', label: 'Mi cuenta' },
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
    <aside className="w-60 shrink-0 bg-[#2b2a33] text-slate-300 flex flex-col min-h-screen">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
        <span className="text-3xl">🎁</span>
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
            <span>{item.icono}</span> {item.label}
          </NavLink>
        ))}
        <button
          onClick={salir}
          className="w-full flex items-center gap-3 px-5 py-3 text-sm transition hover:bg-white/10 hover:text-white text-left"
        >
          <span>🚪</span> Cerrar sesión
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
              <div className="leading-tight">
                <div className="text-[10px] uppercase tracking-widest text-fuchsia-200">Programa</div>
                <div className="text-xl font-extrabold">
                  de Puntos<span className="text-fuchsia-300">■</span>
                </div>
              </div>
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
