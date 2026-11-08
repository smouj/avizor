import {
  MARK_EYE,
  MARK_HOLE,
  MARK_INK,
  MARK_PUPIL_R,
  MARK_SQUIRCLE,
  MARK_TILE_BOTTOM,
  MARK_TILE_TOP,
  MARK_VIEWBOX,
} from '@/components/logo-path'

/**
 * La marca de Avizor: la losa de grafito y el ojo abierto en ascua.
 *
 * La geometría viene de `logo-path.ts`, que lo genera el mismo script que
 * produce los iconos (`scripts/make-icons.mjs`). Así el logo de la cabecera y
 * el icono del sistema no pueden separarse: son la misma forma.
 */
export function Logo({ size = 30, title = 'Avizor' }: { size?: number; title?: string }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox={MARK_VIEWBOX}
      role="img"
      aria-label={title}
      focusable="false"
      className="logo"
    >
      <defs>
        <linearGradient id="avizor-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={MARK_TILE_TOP} />
          <stop offset="1" stopColor={MARK_TILE_BOTTOM} />
        </linearGradient>
      </defs>
      <path d={MARK_SQUIRCLE} fill="url(#avizor-tile)" />
      <path d={MARK_EYE} fill={MARK_INK} />
      <circle cx={512} cy={512} r={MARK_PUPIL_R} fill={MARK_HOLE} />
    </svg>
  )
}
