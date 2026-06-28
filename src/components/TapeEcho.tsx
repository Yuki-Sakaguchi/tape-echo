import { SCALES, type EngineParams } from '../audio/engine'
import { PRESETS } from '../audio/presets'
import { Knob } from './Knob'
import { Reel } from './Reel'
import { VisualWindow } from './VisualWindow'

interface TapeEchoProps {
  playing: boolean
  muted: boolean
  params: EngineParams
  activePreset: string | null
  raining: boolean
  rainLevel: number
  volume: number
  onTogglePlay: () => void
  onToggleMute: () => void
  onParamChange: (next: Partial<EngineParams>) => void
  onPreset: (id: string) => void
  onToggleRain: () => void
  onRainLevel: (v: number) => void
  onVolume: (v: number) => void
}

/** ビンテージ・テープエコー風の本体。機能ごとにゾーン分けして配置する。 */
export function TapeEcho({
  playing,
  muted,
  params,
  activePreset,
  raining,
  rainLevel,
  volume,
  onTogglePlay,
  onToggleMute,
  onParamChange,
  onPreset,
  onToggleRain,
  onRainLevel,
  onVolume,
}: TapeEchoProps) {
  const moodCount = SCALES.length
  const moodIndex = params.mood

  return (
    <div className="device">
      {/* 上段：銘板＋電源ランプ */}
      <header className="device-top">
        <div className="brand">
          <span className="brand-name">ECHOREra</span>
          <span className="brand-sub">TAPE ECHO · AMBIENT GENERATOR</span>
        </div>
        <div className={`power-lamp ${playing ? 'on' : ''}`} title={playing ? '再生中' : '停止'} />
      </header>

      {/* テープ窓：両脇のリールが再生中だけ回り、中央のスクリーンに映像を流す */}
      <div className="tape-window">
        <Reel spinning={playing} side="left" />
        <div className="screen">
          <VisualWindow
            params={params}
            playing={playing}
            raining={raining}
            rainLevel={rainLevel}
            volume={volume}
          />
        </div>
        <Reel spinning={playing} side="right" />
      </div>

      {/* 音作りのツマミ（5つ） */}
      <section className="panel knob-bank">
        <span className="panel-label">TEXTURE</span>
        <div className="knob-row">
          <Knob
            label="MOOD"
            value={moodCount > 1 ? moodIndex / (moodCount - 1) : 0}
            display={SCALES[moodIndex]?.label ?? ''}
            onChange={(v) => onParamChange({ mood: Math.round(v * (moodCount - 1)) })}
          />
          <Knob label="DENSITY" value={params.density} onChange={(v) => onParamChange({ density: v })} />
          <Knob label="REVERB" value={params.reverb} onChange={(v) => onParamChange({ reverb: v })} />
          <Knob label="TONE" value={params.tone} onChange={(v) => onParamChange({ tone: v })} />
          <Knob label="PITCH" value={params.pitch} onChange={(v) => onParamChange({ pitch: v })} />
        </div>
      </section>

      {/* 操作デッキ：再生・音量・雨・プリセットをひとまとめに */}
      <section className="panel deck">
        {/* 再生／停止 と 出力（音量・ミュート） */}
        <div className="transport">
          <button className={`play-btn ${playing ? 'playing' : ''}`} onClick={onTogglePlay}>
            {playing ? '■ STOP' : '▶ PLAY'}
          </button>
          <div className="output">
            <Knob label="VOLUME" size={44} value={volume} onChange={onVolume} />
            <button
              className={`mute-btn ${muted ? 'muted' : ''}`}
              onClick={onToggleMute}
              title={muted ? 'ミュート解除' : 'ミュート'}
            >
              {muted ? '🔇' : '🔊'}
            </button>
          </div>
        </div>

        <div className="deck-divider" />

        {/* 雨スイッチ と プリセット */}
        <div className="deck-bottom">
          <div className="rain-control">
            <button
              className={`rain-switch ${raining ? 'on' : ''}`}
              onClick={onToggleRain}
              aria-pressed={raining}
            >
              <span className="rain-lamp" />
              RAIN
            </button>
            <div className={`rain-amount ${raining ? '' : 'disabled'}`}>
              <Knob
                label="AMOUNT"
                size={40}
                value={rainLevel}
                display={raining ? `${Math.round(rainLevel * 100)}` : '—'}
                onChange={onRainLevel}
              />
            </div>
          </div>

          <div className="presets">
            <span className="presets-label">PRESET</span>
            <div className="presets-btns">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`preset-btn ${activePreset === p.id ? 'active' : ''}`}
                  onClick={() => onPreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
