import { puntos } from './ui'

// Gráfico de línea SVG (puntos por mes): línea índigo con puntos, área
// sombreada y grilla punteada con valores de referencia.
// datos: [{ etiqueta, valor }]
export default function GraficoLinea({ datos = [], etiquetaTooltip = 'puntos' }) {
  const w = 640
  const h = 220
  const pad = 34
  const n = datos.length
  const valores = datos.map((d) => Number(d.valor || 0))
  const max = Math.max(1, ...valores)
  const x = (i) => (n === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (n - 1))
  const y = (v) => h - pad - (v / max) * (h - 2 * pad)
  const pts = valores.map((v, i) => [x(i), y(v)])
  const linea = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ')
  const area = `${linea} L${pts[n - 1]?.[0]},${h - pad} L${pts[0]?.[0]},${h - pad} Z`
  // Evita amontonar etiquetas cuando hay muchos meses
  const salto = Math.max(1, Math.ceil(n / 8))

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Evolución por mes">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line
            x1={pad}
            y1={y(max * f)}
            x2={w - pad}
            y2={y(max * f)}
            stroke="#e2e8f0"
            strokeDasharray="3 4"
          />
          <text x={pad - 8} y={y(max * f) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
            {puntos(Math.round(max * f))}
          </text>
        </g>
      ))}
      {n > 1 && <path d={area} fill="#6366f1" opacity="0.08" />}
      {n > 1 && <path d={linea} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" />}
      {pts.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r="3.5" fill="#6366f1">
          <title>{`${datos[i].etiqueta}: ${puntos(valores[i])} ${etiquetaTooltip}`}</title>
        </circle>
      ))}
      {datos.map((d, i) =>
        i % salto === 0 ? (
          <text
            key={i}
            x={x(i)}
            y={h - pad + 16}
            textAnchor="middle"
            fontSize="10"
            fill="#94a3b8"
            className="capitalize"
          >
            {d.etiqueta}
          </text>
        ) : null
      )}
    </svg>
  )
}
