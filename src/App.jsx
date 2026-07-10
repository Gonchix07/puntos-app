import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clientes from './pages/Clientes'
import CargarPuntos from './pages/CargarPuntos'
import Premios from './pages/Premios'
import Auditoria from './pages/Auditoria'
import Comercios from './pages/Comercios'
import Configuracion from './pages/Configuracion'
import Usuarios from './pages/Usuarios'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Rutas para cualquier usuario logueado (admin u operador) */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/cargar" element={<CargarPuntos />} />
        <Route path="/premios" element={<Premios />} />
        <Route path="/auditoria" element={<Auditoria />} />
      </Route>

      {/* Rutas solo para administrador */}
      <Route
        element={
          <ProtectedRoute requireAdmin>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/comercios" element={<Comercios />} />
        <Route path="/configuracion" element={<Configuracion />} />
        <Route path="/usuarios" element={<Usuarios />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
