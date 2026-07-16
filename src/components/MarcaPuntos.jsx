// Wordmark "Programa de Puntos" del portal de clientes.
// Estilo logo: palabra fina en mayúsculas espaciadas arriba y la palabra
// fuerte abajo en negrita itálica, rematada con el cuadrado fucsia.
export default function MarcaPuntos({ chica = false, className = '' }) {
  return (
    <div className={`leading-none select-none ${className}`}>
      <div
        className={`font-medium uppercase opacity-80 ${
          chica ? 'text-[9px] tracking-[0.3em]' : 'text-[11px] tracking-[0.35em]'
        }`}
      >
        Programa&nbsp;de
      </div>
      <div className={`font-black italic tracking-tight ${chica ? 'text-xl' : 'text-3xl'}`}>
        Puntos<span className="not-italic text-fuchsia-400">■</span>
      </div>
    </div>
  )
}
