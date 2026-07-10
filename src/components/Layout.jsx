import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from './ui'

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  const adminLinks = [
    { to: '/', label: 'Inicio', end: true },
    { to: '/clientes', label: 'Clientes' },
    { to: '/cargar', label: 'Cargar puntos' },
    { to: '/premios', label: 'Premios' },
    { to: '/auditoria', label: 'Auditoría' },
    { to: '/comercios', label: 'Comercios' },
    { to: '/configuracion', label: 'Configuración' },
    { to: '/usuarios', label: 'Usuarios' },
  ]
  // El operador puede consultar y cargar puntos, pero no configurar ni gestionar usuarios
  const operadorLinks = [
    { to: '/', label: 'Inicio', end: true },
    { to: '/clientes', label: 'Clientes' },
    { to: '/cargar', label: 'Cargar puntos' },
    { to: '/premios', label: 'Premios' },
    { to: '/auditoria', label: 'Auditoría' },
  ]
  const links = isAdmin ? adminLinks : operadorLinks

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-indigo-700 text-white">
        <div className="w-full px-6 py-3 flex flex-nowrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-bold text-lg whitespace-nowrap shrink-0">⭐ Puntos</span>
            <nav className="hidden sm:flex flex-wrap gap-1 min-w-0">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) =>
                    `px-2.5 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 ${
                      isActive ? 'bg-white/20' : 'hover:bg-white/10'
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
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
        {/* nav mobile */}
        <nav className="sm:hidden flex gap-1 px-4 pb-2 overflow-x-auto">
          {links.map((l) => (
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
