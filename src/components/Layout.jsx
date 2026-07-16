import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from './ui'

// Menú desplegable para un ítem con subopciones (ej. Premios)
function NavDropdown({ label, items }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const activo = items.some((it) => location.pathname === it.to)
  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`px-2.5 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap inline-flex items-center gap-1 ${
          activo ? 'bg-white/20' : 'hover:bg-white/10'
        }`}
      >
        {label}
        <span className="text-[10px] leading-none">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 mt-1 z-30 min-w-[190px] bg-white rounded-lg shadow-lg py-1 text-slate-700">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `block px-3 py-2 text-sm hover:bg-indigo-50 ${
                  isActive ? 'text-indigo-600 font-medium' : ''
                }`
              }
            >
              {it.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  const premiosItem = {
    label: 'Premios',
    children: [
      { to: '/premios', label: 'Alta Premio', end: true },
      { to: '/premios/solicitudes', label: 'Solicitudes' },
    ],
  }

  const configItem = {
    label: 'Configuración',
    children: [
      { to: '/configuracion', label: 'Parámetros', end: true },
      { to: '/comercios', label: 'Comercios' },
      { to: '/usuarios', label: 'Usuarios' },
    ],
  }

  const puntosItem = {
    label: 'Puntos',
    children: [
      { to: '/cargar', label: 'Carga', end: true },
      { to: '/ajuste', label: 'Ajuste' },
    ],
  }

  const adminLinks = [
    { to: '/', label: 'Inicio', end: true },
    { to: '/clientes', label: 'Clientes' },
    puntosItem,
    premiosItem,
    configItem,
    { to: '/auditoria', label: 'Auditoría' },
  ]
  // El operador puede consultar y cargar puntos, pero no ajustar, configurar ni gestionar usuarios
  const operadorLinks = [
    { to: '/', label: 'Inicio', end: true },
    { to: '/clientes', label: 'Clientes' },
    { to: '/cargar', label: 'Puntos' },
    premiosItem,
    { to: '/auditoria', label: 'Auditoría' },
  ]
  const links = isAdmin ? adminLinks : operadorLinks
  // Para mobile: aplanamos los desplegables en sus subopciones
  const linksPlanos = links.flatMap((l) => (l.children ? l.children : [l]))

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  const pill = ({ isActive }) =>
    `px-2.5 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 ${
      isActive ? 'bg-white/20' : 'hover:bg-white/10'
    }`

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gradient-to-r from-violet-950 via-violet-800 to-violet-600 text-white">
        <div className="w-full px-6 py-3 flex flex-nowrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-bold text-lg whitespace-nowrap shrink-0">⭐ Puntos</span>
            <nav className="hidden sm:flex flex-wrap gap-1 min-w-0">
              {links.map((l) =>
                l.children ? (
                  <NavDropdown key={l.label} label={l.label} items={l.children} />
                ) : (
                  <NavLink key={l.to} to={l.to} end={l.end} className={pill}>
                    {l.label}
                  </NavLink>
                )
              )}
            </nav>
          </div>
          <div className="flex items-center gap-2 text-sm shrink-0">
            <span className="hidden lg:inline opacity-90 whitespace-nowrap truncate max-w-[180px]">{profile?.email}</span>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                isAdmin ? 'bg-white text-amber-700' : 'bg-sky-200 text-sky-800'
              }`}
              title={`Rol: ${isAdmin ? 'Administrador' : 'Operador'}`}
            >
              {isAdmin ? '👑 Administrador' : '🧑‍💼 Operador'}
            </span>
            <Button variant="ghost" className="text-white hover:bg-white/10" onClick={handleLogout}>
              Salir
            </Button>
          </div>
        </div>
        {/* nav mobile (desplegables aplanados) */}
        <nav className="sm:hidden flex gap-1 px-4 pb-2 overflow-x-auto">
          {linksPlanos.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${
                  isActive ? 'bg-white/20' : 'hover:bg-white/10'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1 w-full px-6 py-6">
        <Outlet />
      </main>
    </div>
  )
}
