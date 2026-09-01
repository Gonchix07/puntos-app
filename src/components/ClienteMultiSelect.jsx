import { useMemo, useState } from 'react'

// Selector múltiple de clientes: buscador + chips de seleccionados.
// Props: clientes [{id, nombre, dni}], value (array de ids), onChange(array), label
export default function ClienteMultiSelect({ clientes = [], value = [], onChange, label }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const seleccionados = useMemo(
    () => value.map((id) => clientes.find((c) => c.id === id)).filter(Boolean),
    [value, clientes]
  )

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase()
    const disponibles = clientes.filter((c) => !value.includes(c.id))
    if (!q) return disponibles.slice(0, 50)
    return disponibles
      .filter((c) => c.nombre?.toLowerCase().includes(q) || String(c.dni || '').includes(q))
      .slice(0, 50)
  }, [clientes, value, query])

  function agregar(id) {
    onChange([...value, id])
    setQuery('')
    setOpen(false)
  }
  function quitar(id) {
    onChange(value.filter((v) => v !== id))
  }

  return (
    <div className="block relative">
      {label && <span className="block text-sm font-medium text-slate-600 mb-1">{label}</span>}
      {seleccionados.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {seleccionados.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium px-2 py-1 rounded-full"
            >
              {c.nombre}
              <button
                type="button"
                onClick={() => quitar(c.id)}
                className="text-indigo-400 hover:text-indigo-700"
                aria-label={`Quitar ${c.nombre}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={query}
        placeholder="Buscar por nombre o DNI para agregar…"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                onClick={() => agregar(c.id)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex justify-between gap-2"
              >
                <span className="font-medium text-slate-700">{c.nombre}</span>
                <span className="text-slate-400 whitespace-nowrap">DNI {c.dni}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
