import { useCallback, useRef } from 'react'

interface KnobProps {
  label: string
  /** 0..1 の値 */
  value: number
  onChange: (v: number) => void
  /** つまみの直径(px) */
  size?: number
  /** 値の表示テキスト（省略時は％表示） */
  display?: string
}

// つまみの可動範囲（真下を避けて -135°〜+135°）
const MIN_ANGLE = -135
const MAX_ANGLE = 135

/**
 * 回せるダイヤル。上下ドラッグ（またはホイール）で 0..1 を増減する。
 * 実機のツマミのように、値に応じて指標が回転する。
 */
export function Knob({ label, value, onChange, size = 72, display }: KnobProps) {
  const startRef = useRef<{ y: number; value: number } | null>(null)

  const angle = MIN_ANGLE + (MAX_ANGLE - MIN_ANGLE) * value

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.target as Element).setPointerCapture(e.pointerId)
      startRef.current = { y: e.clientY, value }
    },
    [value],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current
      if (!start) return
      // 上に動かすほど増加。150px のドラッグでフルレンジ。
      const dy = start.y - e.clientY
      const next = Math.min(1, Math.max(0, start.value + dy / 150))
      onChange(next)
    },
    [onChange],
  )

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    startRef.current = null
    ;(e.target as Element).releasePointerCapture(e.pointerId)
  }, [])

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      const next = Math.min(1, Math.max(0, value - Math.sign(e.deltaY) * 0.04))
      onChange(next)
    },
    [onChange, value],
  )

  return (
    <div className="knob">
      <div
        className="knob-dial"
        style={{ width: size, height: size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        tabIndex={0}
      >
        <div className="knob-face" style={{ transform: `rotate(${angle}deg)` }}>
          <span className="knob-indicator" />
        </div>
      </div>
      <div className="knob-label">{label}</div>
      <div className="knob-value">{display ?? `${Math.round(value * 100)}`}</div>
    </div>
  )
}
