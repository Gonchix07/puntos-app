// Pequeños componentes de UI reutilizables (estilo Tailwind)

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    secondary: 'bg-slate-200 hover:bg-slate-300 text-slate-800',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    ghost: 'bg-transparent hover:bg-slate-100 text-slate-700',
  }
  return (
    <button
      className={`px-4 py-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Input({ label, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-medium text-slate-600 mb-1">{label}</span>}
      <input
        className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
        {...props}
      />
    </label>
  )
}

export function Select({ label, children, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-medium text-slate-600 mb-1">{label}</span>}
      <select
        className={`w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  )
}

export function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-xl shadow-sm border border-slate-200 p-5 ${className}`}>{children}</div>
}

export function Badge({ children, color = 'slate' }) {
  const colors = {
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    slate: 'bg-slate-100 text-slate-700',
    amber: 'bg-amber-100 text-amber-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    sky: 'bg-sky-100 text-sky-700',
  }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colors[color]}`}>{children}</span>
}

// Stat: tarjeta de estadística para el dashboard
export function Stat({ label, value, sub, icon, color = 'indigo' }) {
  const ring = {
    indigo: 'bg-indigo-50 text-indigo-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    sky: 'bg-sky-50 text-sky-600',
    violet: 'bg-violet-50 text-violet-600',
  }
  return (
    <Card className="flex items-center gap-4">
      {icon && (
        <div className={`h-11 w-11 grid place-items-center rounded-xl text-xl ${ring[color]}`}>{icon}</div>
      )}
      <div className="min-w-0">
        <div className="text-sm text-slate-500">{label}</div>
        <div className="text-2xl font-bold text-slate-800 leading-tight truncate">{value}</div>
        {sub && <div className="text-xs text-slate-400">{sub}</div>}
      </div>
    </Card>
  )
}

// Formato de pesos argentinos: "$ 1.234.567"
export function money(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(n || 0))
}

// Formato de puntos con separador de miles
export function puntos(n) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(n || 0))
}

// Muestra el número de tarjeta en bloques de 4: 0000 0000 1000 0100
export function formatTarjeta(numero) {
  const digits = String(numero || '').replace(/\D/g, '').padStart(16, '0').slice(0, 16)
  return digits.replace(/(.{4})/g, '$1 ').trim()
}
