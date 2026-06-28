import type { EngineParams } from './engine'

// ワンタップで呼べるプリセット（5つのパラメータの組み合わせ）。
export interface Preset {
  id: string
  label: string
  params: EngineParams
}

export const PRESETS: Preset[] = [
  {
    id: 'night',
    label: 'Night',
    // もの悲しい・疎・深い残響・こもり気味・低め
    params: { mood: 0, density: 0.3, reverb: 0.75, tone: 0.35, pitch: 0.35 },
  },
  {
    id: 'rain',
    label: 'Rainy',
    // 神秘的・やや密・中残響・やわらかい・中くらい
    params: { mood: 3, density: 0.55, reverb: 0.6, tone: 0.45, pitch: 0.5 },
  },
  {
    id: 'space',
    label: 'Space',
    // 幻想的・疎・最大残響・きらびやか・高め
    params: { mood: 2, density: 0.25, reverb: 0.95, tone: 0.7, pitch: 0.65 },
  },
  {
    id: 'morning',
    label: 'Morning',
    // 明るい・密・浅い残響・きらびやか・高め
    params: { mood: 1, density: 0.7, reverb: 0.4, tone: 0.8, pitch: 0.6 },
  },
]
