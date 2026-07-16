import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import { PortalRoot } from './contexts/PortalAuthContext'
import PortalLayout from './components/PortalLayout'
import PortalLogin from './pages/portal/PortalLogin'
import PortalInicio from './pages/portal/PortalInicio'
import PortalCatalogo from './pages/portal/PortalCatalogo'
import PortalTarjeta from './pages/portal/PortalTarjeta'
import PortalCuenta from './pages/portal/PortalCuenta'
import Dashboard from './pages/Dashboard'
import Clientes from './pages/Clientes'
import CargarPuntos from './pages/CargarPuntos'
import Premios from './pages/Premios'
import SolicitudesPremios from './pages/SolicitudesPremios'
import Auditoria from './pages/Auditoria'
import AjustePuntos from './pages/AjustePuntos'
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
        <Route path="/premios/solicitudes" element={<SolicitudesPremios />} />
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
        <Route path="/ajuste" element={<AjustePuntos />} />
        <Route path="/comercios" element={<Comercios />} />
        <Route path="/configuracion" element={<Configuracion />} />
        <Route path="/usuarios" element={<Usuarios />} />
      </Route>

      {/* Portal de clientes (auth propia por usuarios_web, sin Supabase Auth) */}
      <Route element={<PortalRoot />}>
        <Route path="/portal/login" element={<PortalLogin />} />
        <Route path="/portal" element={<PortalLayout />}>
          <Route index element={<PortalInicio />} />
          <Route path="catalogo" element={<PortalCatalogo />} />
          <Route path="tarjeta" element={<PortalTarjeta />} />
          <Route path="cuenta" element={<PortalCuenta />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
