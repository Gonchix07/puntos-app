import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input, Card, Badge, puntos, formatTarjeta } from '../components/ui'

const VACIO = { nombre: '', dni: '', email: '', telefono: '', cliente_web: false, codigo_interno: '' }

export default function Clientes() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(VACIO)
  const [editId, setEditId] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [conMovs, setConMovs] = useState(() => new Set())

  async function cargar() {
    setLoading(true)
    const [{ data, error }, { data: cg }, { data: cj }] = await Promise.all([
      supabase
        .from('clientes')
        .select('*, tarjetas(numero, puntos, puntos_remanentes, activa)')
        .order('created_at', { ascending: false }),
      supabase.from('cargas').select('cliente_id'),
      supabase.from('canjes').select('cliente_id'),
    ])
    if (error) setMsg({ tipo: 'error', texto: error.message })
    const movs = new Set()
    ;(cg || []).forEach((r) => r.cliente_id && movs.add(r.cliente_id))
    ;(cj || []).forEach((r) => r.cliente_id && movs.add(r.cliente_id))
    setConMovs(movs)
    setClientes(data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  function tarjetaDe(c) {
    return Array.isArray(c.tarjetas) ? c.tarjetas[0] : c.tarjetas
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter((c) => {
      const t = tarjetaDe(c)
      return (
        c.nombre?.toLowerCase().includes(q) ||
        String(c.dni || '').includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.codigo_interno?.toLowerCase().includes(q) ||
        String(t?.numero || '').includes(q.replace(/\s/g, ''))
      )
    })
  }, [clientes, busqueda])

  function editar(c) {
    setEditId(c.id)
    setForm({
      nombre: c.nombre,
      dni: c.dni,
      email: c.email || '',
      telefono: c.telefono || '',
      cliente_web: !!c.cliente_web,
      codigo_interno: c.codigo_interno || '',
    })
    setMsg(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelar() {
    setEditId(null)
    setForm(VACIO)
  }

  async function guardar(e) {
    e.preventDefault()
    setMsg(null)
    if (!form.nombre.trim() || !form.dni.trim()) {
      setMsg({ tipo: 'error', texto: 'Nombre y DNI son obligatorios.' })
      return
    }
    if (!/^[1-9][0-9]{6,7}$/.test(form.dni.trim())) {
      setMsg({ tipo: 'error', texto: 'El DNI debe ser un número entre 1.000.000 y 99.999.999.' })
      return
    }
    if (!form.email.trim()) {
      setMsg({ tipo: 'error', texto: 'El email es obligatorio.' })
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setMsg({ tipo: 'error', texto: 'Ingresá una dirección de email válida.' })
      return
    }
    if (form.codigo_interno && !/^[A-Za-z0-9]{5}$/.test(form.codigo_interno)) {
      setMsg({ tipo: 'error', texto: 'El código interno debe tener exactamente 5 caracteres alfanuméricos.' })
      return
    }
    const payload = {
      nombre: form.nombre.trim(),
      dni: form.dni.trim(),
      email: form.email.trim(),
      telefono: form.telefono.trim() || null,
      cliente_web: !!form.cliente_web,
      codigo_interno: form.codigo_interno || null,
    }
    let error
    if (editId) {
      ;({ error } = await supabase.from('clientes').update(payload).eq('id', editId))
    } else {
      ;({ error } = await supabase.from('clientes').insert(payload))
    }
    if (error) {
      const dup = error.message.includes('dni')
      setMsg({ tipo: 'error', texto: dup ? 'Ya existe un cliente con ese DNI.' : error.message })
      return
    }
    setMsg({
      tipo: 'ok',
      texto: editId ? 'Cliente actualizado.' : 'Cliente creado y tarjeta emitida automáticamente.',
    })
    cancelar()
    cargar()
  }

  async function eliminar(c) {
    if (!confirm(`¿Eliminar al cliente "${c.nombre}"? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('clientes').delete().eq('id', c.id)
    if (error) {
      setMsg({ tipo: 'error', texto: error.message })
      return
    }
    setMsg({ tipo: 'ok', texto: 'Cliente eliminado.' })
    cargar()
  }

  async function toggleActivo(c) {
    const nuevo = !c.activo
    const texto = nuevo
      ? `¿Reactivar al cliente "${c.nombre}"? Su tarjeta volverá a estar activa.`
      : `¿Dar de baja al cliente "${c.nombre}"? Su tarjeta quedará inactiva (no podrá cargar ni canjear puntos).`
    if (!confirm(texto)) return
    const { error } = await supabase.from('clientes').update({ activo: nuevo }).eq('id', c.id)
    if (error) {
      setMsg({ tipo: 'error', texto: error.message })
      return
    }
    setMsg({ tipo: 'ok', texto: nuevo ? 'Cliente reactivado.' : 'Cliente dado de baja.' })
    cargar()
  }

  function onTel(e) {
    // Máscara simple: solo dígitos, hasta 10
    const d = e.target.value.replace(/\D/g, '').slice(0, 10)
    setForm((f) => ({ ...f, telefono: d }))
  }

  // ---------- Importación masiva por Excel ----------
  const fileRef = useRef(null)
  const [importando, setImportando] = useState(false)
  const [importResult, setImportResult] = useState(null)

  function descargarPlantilla() {
    const encabezados = [
      ['nombre *', 'dni *', 'email *', 'telefono (opcional)', 'cliente web (SI/NO)', 'codigo interno (opcional)'],
      ['Juan Pérez', '30123456', 'juan@ejemplo.com', '2235937766', 'NO', 'ABC12'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(encabezados)
    ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 22 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
    XLSX.writeFile(wb, 'plantilla_clientes.xlsx')
  }

  async function importarArchivo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportResult(null)
    setImportando(true)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const filas = XLSX.utils.sheet_to_json(ws, { defval: '' })

      const ok = []
      const errores = []

      for (const [i, fila] of filas.entries()) {
        const num = i + 2 // fila 1 = encabezados
        const nombre = String(fila['nombre *'] || fila['nombre'] || '').trim()
        const dni = String(fila['dni *'] || fila['dni'] || '').replace(/\D/g, '').trim()
        const email = String(fila['email *'] || fila['email (opcional)'] || fila['email'] || '').trim()
        const telefono = String(fila['telefono (opcional)'] || fila['telefono'] || '')
          .replace(/\D/g, '')
          .slice(0, 10)
        const webRaw = String(fila['cliente web (SI/NO)'] || fila['cliente web'] || fila['cliente_web'] || '')
          .trim()
          .toUpperCase()
        const clienteWeb = ['SI', 'SÍ', 'S', 'X', '1', 'TRUE', 'VERDADERO'].includes(webRaw)
        const codigoInterno = String(fila['codigo interno (opcional)'] || fila['codigo interno'] || fila['codigo_interno'] || '')
          .replace(/[^A-Za-z0-9]/g, '')
          .toUpperCase()

        if (!nombre) { errores.push({ num, nombre: '—', motivo: 'Nombre vacío' }); continue }
        if (!dni) { errores.push({ num, nombre, motivo: 'DNI vacío o inválido' }); continue }
        if (!/^[1-9][0-9]{6,7}$/.test(dni)) {
          errores.push({ num, nombre, motivo: `DNI inválido: "${dni}" (debe ser un número entre 1.000.000 y 99.999.999)` })
          continue
        }
        if (!email) { errores.push({ num, nombre, motivo: 'Email vacío' }); continue }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errores.push({ num, nombre, motivo: `Email inválido: "${email}"` }); continue
        }
        if (codigoInterno && !/^[A-Z0-9]{5}$/.test(codigoInterno)) {
          errores.push({ num, nombre, motivo: `Código interno inválido: "${codigoInterno}" (deben ser 5 caracteres alfanuméricos)` })
          continue
        }

        const payload = {
          nombre,
          dni,
          email,
          telefono: telefono || null,
          cliente_web: clienteWeb,
          codigo_interno: codigoInterno || null,
        }

        const { error } = await supabase.from('clientes').insert(payload)
        if (error) {
          const motivo = error.message.includes('dni')
            ? 'Ya existe un cliente con ese DNI'
            : error.message
          errores.push({ num, nombre, motivo })
        } else {
          ok.push(`${nombre} (${dni})`)
        }
      }

      setImportResult({ ok, errores })
      if (ok.length > 0) cargar()
    } catch (err) {
      setImportResult({
        ok: [],
        errores: [{ num: '—', nombre: '—', motivo: 'No se pudo leer el archivo: ' + err.message }],
      })
    } finally {
      setImportando(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Clientes</h1>

      {msg && (
        <div
          className={`rounded-lg px-4 py-2 text-sm ${
            msg.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {msg.texto}
        </div>
      )}

      {isAdmin && (
        <Card>
          <h2 className="font-semibold text-slate-700 mb-3">
            {editId ? 'Editar cliente' : 'Nuevo cliente'}
          </h2>
          <form onSubmit={guardar} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <Input
              label="Nombre y apellido"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              required
            />
            <Input
              label="DNI"
              value={form.dni}
              onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
              inputMode="numeric"
              maxLength={8}
              placeholder="7 u 8 dígitos"
              required
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
            <Input label="Teléfono" value={form.telefono} onChange={onTel} placeholder="Solo números" />
            <Input
              label="Código interno (opcional)"
              value={form.codigo_interno}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  codigo_interno: e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5),
                }))
              }
              maxLength={5}
              placeholder="5 caracteres"
            />
            <label className="flex items-center gap-2 text-sm text-slate-600 pb-2">
              <input
                type="checkbox"
                checked={form.cliente_web}
                onChange={(e) => setForm((f) => ({ ...f, cliente_web: e.target.checked }))}
              />
              Cliente Web
            </label>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                {editId ? 'Guardar' : 'Crear'}
              </Button>
              {editId && (
                <Button type="button" variant="secondary" onClick={cancelar}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
          {!editId && (
            <p className="text-xs text-slate-400 mt-2">
              Al crear el cliente se le emite automáticamente una tarjeta virtual única de 16 dígitos.
            </p>
          )}
        </Card>
      )}

      {isAdmin && (
        <Card>
          <h2 className="font-semibold text-slate-700 mb-1">Importar clientes desde Excel</h2>
          <p className="text-xs text-slate-500 mb-3">
            Descargá la plantilla, completá una fila por cliente y subila. Cada cliente creado recibe
            automáticamente su tarjeta virtual. Los DNI duplicados se informan y se omiten.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <Button variant="secondary" onClick={descargarPlantilla}>
              ⬇️ Descargar plantilla
            </Button>
            <Button variant="secondary" disabled={importando} onClick={() => fileRef.current?.click()}>
              {importando ? 'Importando…' : '⬆️ Subir archivo Excel'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={importarArchivo}
            />
          </div>

          {importResult && (
            <div className="space-y-3 text-xs mt-4">
              {importResult.ok.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="font-semibold text-green-700 mb-1">
                    ✅ {importResult.ok.length} cliente{importResult.ok.length !== 1 ? 's' : ''} creado
                    {importResult.ok.length !== 1 ? 's' : ''}
                  </p>
                  <ul className="list-disc list-inside text-green-600 space-y-0.5">
                    {importResult.ok.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {importResult.errores.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="font-semibold text-red-700 mb-2">
                    ❌ {importResult.errores.length} fila{importResult.errores.length !== 1 ? 's' : ''} con
                    error
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-red-500 border-b border-red-200">
                        <th className="pb-1 pr-3">Fila</th>
                        <th className="pb-1 pr-3">Nombre</th>
                        <th className="pb-1">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.errores.map((er, i) => (
                        <tr key={i} className="border-b border-red-100 last:border-0">
                          <td className="py-1 pr-3 text-slate-500">{er.num}</td>
                          <td className="py-1 pr-3 font-medium">{er.nombre}</td>
                          <td className="py-1 text-red-600">{er.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {importResult.ok.length === 0 && importResult.errores.length === 0 && (
                <p className="text-slate-400">El archivo no tenía filas de datos.</p>
              )}
            </div>
          )}
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-semibold text-slate-700">
            Listado <span className="text-slate-400 font-normal">({filtrados.length})</span>
          </h2>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, DNI, email o tarjeta…"
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-full sm:w-80 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {loading ? (
          <p className="text-slate-500">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-slate-400">No hay clientes que coincidan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">DNI</th>
                  <th className="py-2 pr-3">Contacto</th>
                  <th className="py-2 pr-3">Tarjeta</th>
                  <th className="py-2 pr-3 text-right">Puntos (acum · disp)</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => {
                  const t = tarjetaDe(c)
                  const tieneMovs = conMovs.has(c.id)
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-slate-100 align-top ${c.activo ? '' : 'opacity-60'}`}
                    >
                      <td className="py-2 pr-3 font-medium text-slate-700" data-label="Cliente">
                        {c.nombre}
                        {c.cliente_web && (
                          <span className="ml-2">
                            <Badge color="sky">🌐 web</Badge>
                          </span>
                        )}
                        {c.codigo_interno && (
                          <div className="text-xs font-mono font-normal text-slate-400">
                            cód: {c.codigo_interno}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3" data-label="DNI">
                        {c.dni}
                      </td>
                      <td className="py-2 pr-3 text-slate-500" data-label="Contacto">
                        <div>{c.email || '—'}</div>
                        {c.telefono && <div className="text-xs">{c.telefono}</div>}
                      </td>
                      <td className="py-2 pr-3 font-mono text-slate-600 whitespace-nowrap" data-label="Tarjeta">
                        {t ? formatTarjeta(t.numero) : '—'}
                        {t && !t.activa && (
                          <span className="ml-2">
                            <Badge color="red">inactiva</Badge>
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right" data-label="Puntos (acum · disp)">
                        <div className="flex flex-col items-end gap-0.5">
                          <Badge color="amber">⭐ {puntos(t?.puntos || 0)}</Badge>
                          <span
                            className="text-xs text-slate-400"
                            title="Puntos remanentes (disponibles para canjear, descontando pendientes)"
                          >
                            disp: {puntos(t?.puntos_remanentes ?? t?.puntos ?? 0)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-3" data-label="Estado">
                        <Badge color={c.activo ? 'green' : 'slate'}>{c.activo ? 'Activo' : 'Inactivo'}</Badge>
                      </td>
                      <td className="py-2 pr-3" data-label="Acciones">
                        <div className="flex gap-2 justify-end flex-wrap">
                          <Button
                            variant="ghost"
                            className="px-2 py-1 text-xs text-indigo-600"
                            onClick={() => navigate(`/auditoria?cliente=${c.id}`)}
                            title="Ver movimientos del cliente en la auditoría"
                          >
                            📊 Movimientos
                          </Button>
                          {isAdmin && (
                            <>
                              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => editar(c)}>
                                ✏️ Editar
                              </Button>
                              <Button
                                variant="ghost"
                                className={`px-2 py-1 text-xs ${c.activo ? 'text-amber-600' : 'text-green-600'}`}
                                onClick={() => toggleActivo(c)}
                                title={c.activo ? 'Dar de baja' : 'Reactivar'}
                              >
                                {c.activo ? '⏸️ Baja' : '▶️ Alta'}
                              </Button>
                              {!tieneMovs && (
                                <Button
                                  variant="ghost"
                                  className="px-2 py-1 text-xs text-red-600"
                                  onClick={() => eliminar(c)}
                                  title="Eliminar (solo clientes sin movimientos)"
                                >
                                  🗑️
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
