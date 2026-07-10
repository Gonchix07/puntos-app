import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input, Card } from '../components/ui'

export default function Login() {
  const { signIn, session, loading: authLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && session) {
      navigate('/', { replace: true })
    }
  }, [authLoading, session, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      setLoading(false)
      setError(error.message || 'Email o contraseña incorrectos.')
      console.error('Login error:', error)
      return
    }
    // La redirección la maneja el useEffect cuando el perfil terminó de cargar
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-indigo-600 to-indigo-900 px-4">
      <Card className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">
            <span className="star-anim">⭐</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800">Programa de Puntos</h1>
          <p className="text-sm text-slate-500">Iniciá sesión para continuar</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <div className="relative">
            <Input
              label="Contraseña"
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 bottom-2 text-slate-400 hover:text-slate-600 text-lg leading-none"
              tabIndex={-1}
              aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPass ? '🙈' : '👁️'}
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t text-center text-xs text-slate-400 leading-relaxed">
          <p className="font-medium text-slate-500">Departamento de Sistemas</p>
          <p>HERGO | MENOR COSTE</p>
          <p>ver.1.0.0</p>
        </div>
      </Card>
    </div>
  )
}
