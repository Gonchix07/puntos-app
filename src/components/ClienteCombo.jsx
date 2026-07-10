import { useMemo, useState } from 'react'

// Select editable que filtra clientes por nombre, DNI o número de tarjeta.
// Props: clientes [{id, nombre, dni, tarjeta_numero}], value (id), onChange(id)
export default function ClienteCombo({
  clientes = [],
  value,
  onChange,
  label,
  placeholder = 'Buscar por nombre, DNI o tarjeta…',
  inputClassName = '',
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const seleccionado = clientes.find((c) => c.id === value) || null

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clientes.slice(0, 50)
    return clientes
      .filter((c) => {
        const numero = String(c.tarjeta_numero || '').toLowerCase()
        return (
          c.nombre?.toLowerCase().includes(q) ||
          String(c.dni || '').toLowerCase().includes(q) ||
          numero.includes(q.replace(/\s/g, ''))
        )
      })
      .slice(0, 50)
  }, [clientes, query])

  const textoVisible = open ? query : seleccionado ? `${seleccionado.nombre} — DNI ${seleccionado.dni}` : ''

  return (
    <label className="block relative">
      {label && <span className="block text-sm font-medium text-slate-600 mb-1">{label}</span>}
      <input
        value={textoVisible}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${inputClassName}`}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg">
          {filtrados.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">Sin resultados</div>
          ) : (
            filtrados.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(c.id)
                  setOpen(false)
                  setQuery('')
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex justify-between gap-2"
              >
                <span className="font-medium text-slate-700">{c.nombre}</span>
                <span className="text-slate-400 whitespace-nowrap">DNI {c.dni}</span>
              </button>
            ))
          )}
        </div>
      )}
    </label>
  )
}
