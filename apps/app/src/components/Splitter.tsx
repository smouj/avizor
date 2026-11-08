import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

import { useAvizor } from '@/state/store'

/**
 * El tirador que separa dos columnas del armazón.
 *
 * Es una zona de 8px con una línea de un filo en medio: el borde no se duplica y
 * hay sitio de sobra para agarrarlo sin apuntar. Arrastrar cambia la medida de
 * la columna **de al lado** (la navegación o el panel lateral), y el ancho se
 * guarda con el resto del estado, así que la ventana se abre como la dejaste.
 *
 * Los tres gestos hacen lo mismo por caminos distintos, y ninguno es un adorno:
 * arrastrar con el ratón, las flechas del teclado (16px por pulsación) y el
 * doble clic para volver a la medida de los tokens. El foco entra con Tab y el
 * `role="separator"` es el de verdad, con sus valores mínimo, máximo y actual.
 */

export type SplitterSide = 'nav' | 'rail'

/**
 * Lo que aguanta cada columna, en píxeles. Por debajo de esto el texto se parte
 * letra a letra; por encima, la columna se come la vista y el centro desaparece.
 */
const BOUNDS: Record<SplitterSide, { min: number; max: number }> = {
  nav: { min: 176, max: 384 },
  rail: { min: 208, max: 512 },
}

/** Cuánto se mueve con cada flecha: 1rem, el paso de la escala de espaciado. */
const STEP = 16

export function Splitter({ side }: { side: SplitterSide }): JSX.Element {
  const width = useAvizor((state) => state.layout[side])
  const setLayoutWidth = useAvizor((state) => state.setLayoutWidth)
  const resetLayoutWidth = useAvizor((state) => state.resetLayoutWidth)
  const t = useAvizor((state) => state.t)

  const [dragging, setDragging] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const origin = useRef({ x: 0, width: 0 })

  /**
   * El ancho real de la columna que hay al otro lado del tirador. Se mide en el
   * momento de empezar a arrastrar: el token puede ser un `clamp()` y su valor
   * depende del ancho de la ventana, así que el número que hay que mover es el
   * que se ve, no el que está escrito.
   */
  const measure = useCallback((): number => {
    const node = ref.current
    if (!node) return 0
    const column = side === 'nav' ? node.previousElementSibling : node.nextElementSibling
    return column instanceof HTMLElement ? column.getBoundingClientRect().width : 0
  }, [side])

  const clamp = useCallback(
    (px: number): number => {
      const { min, max } = BOUNDS[side]
      return Math.min(max, Math.max(min, Math.round(px)))
    },
    [side],
  )

  const apply = useCallback(
    (px: number) => {
      setLayoutWidth(side, clamp(px))
    },
    [clamp, setLayoutWidth, side],
  )

  /** El ancho de partida: el guardado o, si nunca se ha movido, el que se ve. */
  const base = width ?? measure()

  useEffect(() => {
    if (!dragging) return undefined
    const onMove = (event: PointerEvent): void => {
      const delta = event.clientX - origin.current.x
      // El rail está a la derecha: al arrastrar hacia la izquierda, crece.
      apply(side === 'nav' ? origin.current.width + delta : origin.current.width - delta)
    }
    const onEnd = (): void => setDragging(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
  }, [apply, dragging, side])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    origin.current = { x: event.clientX, width: measure() }
    setDragging(true)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowLeft' ? -STEP : event.key === 'ArrowRight' ? STEP : 0
    if (step !== 0) {
      event.preventDefault()
      apply(side === 'nav' ? base + step : base - step)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      resetLayoutWidth(side)
    }
  }

  const label = t(side === 'nav' ? 'layout.splitterNav' : 'layout.splitterRail')

  return (
    <div
      ref={ref}
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={BOUNDS[side].min}
      aria-valuemax={BOUNDS[side].max}
      {...(width === null ? {} : { 'aria-valuenow': Math.round(base) })}
      tabIndex={0}
      data-dragging={dragging ? 'true' : 'false'}
      title={t('layout.splitterHint')}
      onPointerDown={onPointerDown}
      onDoubleClick={() => resetLayoutWidth(side)}
      onKeyDown={onKeyDown}
    >
      <span className="sr-only">{label}</span>
    </div>
  )
}
