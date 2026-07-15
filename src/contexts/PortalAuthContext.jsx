import { createContext, useCallback, useContext, useState } from 'react'
import { Outlet } from 'react-router-dom'

// Sesión del portal de clientes: token propio (usuarios_web) guardado en
// localStorage, independiente del login admin/operador de Supabase Auth.

const PortalAuthContext = createContext(null)

export function PortalAuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('portal_token'))
  const [nombre, setNombre] = useState(() => localStorage.getItem('portal_nombre') || '')

  const guardarSesion = useCallback((t, n) => {
    localStorage.setItem('portal_token', t)
    localStorage.setItem('portal_nombre', n || '')
    setToken(t)
    setNombre(n || '')
  }, [])

  const cerrarSesion = useCallback(() => {
    localStorage.removeItem('portal_token')
    localStorage.removeItem('portal_nombre')
    setToken(null)
    setNombre('')
  }, [])

  // fetch con manejo de token: si la API devuelve 401, la sesión se corta.
  const api = useCallback(
    async (path, opts = {}) => {
      const r = await fetch(path, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...opts.headers,
        },
      })
      const esJson = (r.headers.get('content-type') || '').includes('application/json')
      const data = esJson ? await r.json().catch(() => ({})) : {}
      if (r.status === 401 && token) cerrarSesion()
      if (!r.ok) throw new Error(data.error || 'Error del servidor. Probá de nuevo.')
      // En `vite dev` no corren las funciones /api: Vite responde el HTML del index con 200.
      if (!esJson) throw new Error('La API del portal no está disponible (en local usá `vercel dev`).')
      return data
    },
    [token, cerrarSesion]
  )

  return (
    <PortalAuthContext.Provider value={{ token, nombre, guardarSesion, cerrarSesion, api }}>
      {children}
    </PortalAuthContext.Provider>
  )
}

// Elemento de ruta: envuelve todo el subárbol /portal con el provider.
export function PortalRoot() {
  return (
    <PortalAuthProvider>
      <Outlet />
    </PortalAuthProvider>
  )
}

export function usePortal() {
  return useContext(PortalAuthContext)
}
