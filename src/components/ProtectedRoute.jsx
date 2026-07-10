import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children, requireAdmin = false, roles }) {
  const { session, isAdmin, role, loading } = useAuth()

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-slate-500">Cargando…</div>
  }
  if (!session) return <Navigate to="/login" replace />
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />
  // Si se especifican roles permitidos, el admin siempre puede; el resto debe coincidir
  if (roles && !isAdmin && !roles.includes(role)) return <Navigate to="/" replace />

  return children
}
