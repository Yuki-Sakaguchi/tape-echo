import { useEffect, useRef } from 'react'
import type { EngineParams } from '../audio/engine'

interface VisualWindowProps {
  params: EngineParams
  playing: boolean
  raining: boolean
  rainLevel: number
  volume: number
}

// MOOD（スケール）に対応した配色パレット（index は SCALES と揃える）
const PALETTES: [string, string, string][] = [
  ['#2747a0', '#5a7be0', '#a06fe0'], // もの悲しい：青〜紫（冷たい）
  ['#2f9a55', '#8fd86a', '#f2e68f'], // 明るい：緑〜黄（暖かい）
  ['#8a3fb0', '#e07ac8', '#ffb0e0'], // 幻想的：紫〜ピンク
  ['#159a92', '#3fd0c0', '#9ff0e0'], // 神秘的：ティール〜シアン
]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const hexRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

interface Drop {
  x: number
  y: number
  len: number
  spd: number
}

/**
 * テープのスクリーンに流す生成ビジュアル（流れる波／オーロラ）。
 * 全パラメータが見た目に連動する：
 *   MOOD→配色 / PITCH→速度 / DENSITY→帯の数と細かさ /
 *   TONE→明るさ・鮮やかさ / REVERB→残像（尾の長さ）/ VOLUME→振幅・強さ。
 * RAIN が ON のときは雨を上に降らせる。
 */
export function VisualWindow(props: VisualWindowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 毎フレーム最新値を読むための参照（rAF を作り直さない）
  const stateRef = useRef(props)
  stateRef.current = props
  const dropsRef = useRef<Drop[]>([])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let raf = 0
    let W = 0
    let H = 0

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      W = Math.max(1, Math.floor(r.width))
      H = Math.max(1, Math.floor(r.height))
      canvas.width = Math.floor(W * dpr)
      canvas.height = Math.floor(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const frame = (t: number) => {
      const s = stateRef.current
      const p = s.params
      const pal = PALETTES[p.mood] ?? PALETTES[0]
      const speed = lerp(0.15, 1.4, p.pitch) * (s.playing ? 1 : 0.3)
      const bands = Math.round(lerp(2, 6, p.density))
      const tone = p.tone
      const clearAlpha = lerp(0.2, 0.07, p.reverb) // 残響大＝薄く消す＝尾が長い
      const vol = lerp(0.25, 1, s.volume) * (s.playing ? 1 : 0.55)
      const tt = t * 0.001

      // 残像を残しつつ前フレームを薄く消す（尾の表現）
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = `rgba(10,12,16,${clearAlpha})`
      ctx.fillRect(0, 0, W, H)

      // オーロラの帯（加算合成で発光させる）
      ctx.globalCompositeOperation = 'lighter'
      const fx = ((Math.PI * 2) / W) * lerp(1.2, 2.8, p.density)
      for (let b = 0; b < bands; b++) {
        const base = hexRgb(pal[b % pal.length])
        // TONE で白へ寄せて明るく・鮮やかに
        const r = Math.round(lerp(base[0], 255, tone * 0.5))
        const g = Math.round(lerp(base[1], 255, tone * 0.5))
        const bl = Math.round(lerp(base[2], 255, tone * 0.5))
        const alpha = lerp(0.04, 0.16, tone) * vol
        const yBase = H * 0.5 + (b - (bands - 1) / 2) * (H * 0.12)
        const amp = H * lerp(0.08, 0.26, vol)

        ctx.beginPath()
        for (let x = 0; x <= W; x += 4) {
          const y =
            yBase +
            amp * Math.sin(x * fx + tt * speed + b * 1.3) +
            amp * 0.5 * Math.sin(x * fx * 0.6 - tt * speed * 0.8 + b * 2.1)
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.lineWidth = H * 0.14
        ctx.strokeStyle = `rgba(${r},${g},${bl},${alpha})`
        ctx.shadowColor = `rgba(${r},${g},${bl},${alpha})`
        ctx.shadowBlur = H * 0.18
        ctx.stroke()
      }
      ctx.shadowBlur = 0

      // 雨（RAIN ON のときだけ上に降らせる）
      if (s.raining) {
        const drops = dropsRef.current
        const target = Math.round(lerp(12, 90, s.rainLevel))
        while (drops.length < target) {
          drops.push({
            x: Math.random() * W,
            y: Math.random() * H,
            len: lerp(6, 16, s.rainLevel) * (0.6 + Math.random() * 0.8),
            spd: lerp(180, 560, s.rainLevel) * (0.7 + Math.random() * 0.6),
          })
        }
        if (drops.length > target) drops.length = target

        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = `rgba(205,222,255,${lerp(0.18, 0.42, s.rainLevel)})`
        ctx.lineWidth = 1
        ctx.beginPath()
        const dt = 1 / 60
        for (const d of drops) {
          d.y += d.spd * dt
          if (d.y > H + d.len) {
            d.y = -d.len
            d.x = Math.random() * W
          }
          ctx.moveTo(d.x, d.y)
          ctx.lineTo(d.x + d.len * 0.16, d.y + d.len) // わずかに斜め
        }
        ctx.stroke()
      } else if (dropsRef.current.length) {
        dropsRef.current.length = 0
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className="visual-canvas" />
}
