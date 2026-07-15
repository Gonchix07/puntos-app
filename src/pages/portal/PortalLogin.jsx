import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { usePortal } from '../../contexts/PortalAuthContext'
import { Button, Input, Card } from '../../components/ui'

// Login del portal de clientes. Modos:
//   login    — email + contraseña
//   registro — crear cuenta (DNI + email de la ficha del cliente + contraseña)
//   olvido   — pide el mail de recupero (Brevo)
//   reset    — define nueva contraseña (se entra desde el link del mail: ?reset=TOKEN)

export default function PortalLogin() {
  const { token, guardarSesion, api } = usePortal()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const resetToken = searchParams.get('reset') || ''

  const [modo, setModo] = useState(resetToken ? 'reset' : 'login')
  const [form, setForm] = useState({ dni: '', email: '', password: '', password2: '' })
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  useEffect(() => {
    if (token) navigate('/portal', { replace: true })
  }, [token, navigate])

  function set(campo) {
    return (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))
  }

  function cambiarModo(m) {
    setModo(m)
    setMsg(null)
    setForm((f) => ({ ...f, password: '', password2: '' }))
  }

  async function enviar(e) {
    e.preventDefault()
    setMsg(null)

    if ((modo === 'registro' || modo === 'reset') && form.password !== form.password2) {
      setMsg({ tipo: 'error', texto: 'Las contraseñas no coinciden.' })
      return
    }

    setLoading(true)
    try {
      if (modo === 'login') {
        const d = await api('/api/portal-auth', {
          method: 'POST',
          body: JSON.stringify({ action: 'login', email: form.email, password: form.password }),
        })
        guardarSesion(d.token, d.nombre)
        navigate('/portal', { replace: true })
      } else if (modo === 'registro') {
        const d = await api('/api/portal-auth', {
          method: 'POST',
          body: JSON.stringify({
            action: 'registro',
            dni: form.dni,
            email: form.email,
            password: form.password,
          }),
        })
        guardarSesion(d.token, d.nombre)
        navigate('/portal', { replace: true })
      } else if (modo === 'olvido') {
        await api('/api/portal-auth', {
          method: 'POST',
          body: JSON.stringify({ action: 'olvido', email: form.email }),
        })
        setMsg({
          tipo: 'ok',
          texto: 'Si el email está registrado, te enviamos un enlace para restablecer la contraseña (vence en 1 hora). Revisá también el correo no deseado.',
        })
      } else if (modo === 'reset') {
        await api('/api/portal-auth', {
          method: 'POST',
          body: JSON.stringify({ action: 'reset', token: resetToken, password: form.password }),
        })
        setSearchParams({}, { replace: true })
        setMsg({ tipo: 'ok', texto: 'Contraseña actualizada. Ya podés iniciar sesión.' })
        setModo('login')
        setForm((f) => ({ ...f, password: '', password2: '' }))
      }
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message })
    } finally {
      setLoading(false)
    }
  }

  const titulos = {
    login: ['Portal de Clientes', 'Iniciá sesión para ver tus puntos'],
    registro: ['Crear mi cuenta', 'Usá el DNI y el email que registraste en el comercio'],
    olvido: ['Recuperar contraseña', 'Te enviamos un enlace a tu email'],
    reset: ['Nueva contraseña', 'Elegí tu nueva contraseña'],
  }
  const [titulo, subtitulo] = titulos[modo]

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-violet-950 via-purple-800 to-fuchsia-700 px-4">
      <Card className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">
            <span className="star-anim">🎁</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800">{titulo}</h1>
          <p className="text-sm text-slate-500">{subtitulo}</p>
        </div>

        <form onSubmit={enviar} className="space-y-4">
          {modo === 'registro' && (
            <Input
              label="DNI"
              value={form.dni}
              onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
              inputMode="numeric"
              maxLength={8}
              placeholder="Sin puntos"
              required
            />
          )}

          {modo !== 'reset' && (
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={set('email')}
              required
              autoComplete="email"
            />
          )}

          {modo !== 'olvido' && (
            <div className="relative">
              <Input
                label={modo === 'login' ? 'Contraseña' : 'Nueva contraseña (mínimo 8)'}
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                minLength={modo === 'login' ? undefined : 8}
                required
                autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
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
          )}

          {(modo === 'registro' || modo === 'reset') && (
            <Input
              label="Repetir contraseña"
              type={showPass ? 'text' : 'password'}
              value={form.password2}
              onChange={set('password2')}
              minLength={8}
              required
              autoComplete="new-password"
            />
          )}

          {msg && (
            <p className={`text-sm ${msg.tipo === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{msg.texto}</p>
          )}

          <Button type="submit" className="w-full !bg-fuchsia-700 hover:!bg-fuchsia-800" disabled={loading}>
            {loading
              ? 'Procesando…'
              : modo === 'login'
                ? 'Ingresar'
                : modo === 'registro'
                  ? 'Crear cuenta'
                  : modo === 'olvido'
                    ? 'Enviar enlace'
                    : 'Guardar contraseña'}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm space-y-1">
          {modo === 'login' && (
            <>
              <button className="text-fuchsia-700 hover:underline block w-full" onClick={() => cambiarModo('olvido')}>
                Olvidé mi contraseña
              </button>
              <button className="text-fuchsia-700 hover:underline block w-full" onClick={() => cambiarModo('registro')}>
                ¿Primera vez? Creá tu cuenta
              </button>
            </>
          )}
          {modo !== 'login' && (
            <button className="text-fuchsia-700 hover:underline" onClick={() => cambiarModo('login')}>
              ← Volver a iniciar sesión
            </button>
          )}
        </div>

        <div className="mt-6 pt-4 border-t text-center text-xs text-slate-400">
          <Link to="/login" className="hover:underline">
            Acceso para comercios y administración
          </Link>
        </div>
      </Card>
    </div>
  )
}
