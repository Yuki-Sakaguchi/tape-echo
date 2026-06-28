import { useCallback, useEffect, useRef, useState } from 'react'
import { AmbientEngine, DEFAULT_PARAMS, type EngineParams } from './audio/engine'
import { makeLoopWav } from './audio/loop'
import { PRESETS } from './audio/presets'
import { TapeEcho } from './components/TapeEcho'

/** Blob をファイルとしてダウンロードさせる。 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** ファイル名用のタイムスタンプ（YYYYMMDD-HHMMSS）。 */
function timestamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
}

export default function App() {
  // エンジンは1つだけ。再レンダーで作り直さないよう ref で保持。
  const engineRef = useRef<AmbientEngine | null>(null)
  if (!engineRef.current) engineRef.current = new AmbientEngine()

  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [params, setParams] = useState<EngineParams>(DEFAULT_PARAMS)
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [raining, setRaining] = useState(false)
  const [rainLevel, setRainLevel] = useState(0.5)
  const [volume, setVolume] = useState(0.8)
  const [recording, setRecording] = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const [processing, setProcessing] = useState(false)
  const recTimerRef = useRef<number | null>(null)

  // アンマウント時に確実に停止
  useEffect(() => {
    const engine = engineRef.current
    return () => {
      engine?.stop()
      engine?.setRain(false)
      if (recTimerRef.current !== null) clearInterval(recTimerRef.current)
    }
  }, [])

  const togglePlay = useCallback(() => {
    const engine = engineRef.current!
    if (engine.isRunning) {
      // 停止：音楽と一緒に雨も止める（RAINの設定自体は保持）
      engine.stop()
      engine.setRain(false)
      setPlaying(false)
    } else {
      engine.setParams(params)
      engine.start()
      // 雨を入れる設定なら、再生に合わせて雨も鳴らす
      if (raining) engine.setRain(true)
      setPlaying(true)
    }
  }, [params, raining])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m
      engineRef.current!.setMuted(next)
      return next
    })
  }, [])

  const handleParamChange = useCallback((next: Partial<EngineParams>) => {
    setParams((prev) => {
      const merged = { ...prev, ...next }
      engineRef.current!.setParams(merged)
      return merged
    })
    setActivePreset(null) // 手動で動かしたらプリセット選択を解除
  }, [])

  const handlePreset = useCallback((id: string) => {
    const preset = PRESETS.find((p) => p.id === id)
    if (!preset) return
    setParams(preset.params)
    engineRef.current!.setParams(preset.params)
    setActivePreset(id)
  }, [])

  const toggleRain = useCallback(() => {
    setRaining((r) => {
      const next = !r
      // 実際に雨を鳴らすのは再生中のみ（停止中はトグルの設定だけ変える）
      const engine = engineRef.current!
      if (engine.isRunning) engine.setRain(next)
      return next
    })
  }, [])

  const handleRainLevel = useCallback((v: number) => {
    setRainLevel(v)
    engineRef.current!.setRainLevel(v)
  }, [])

  const handleVolume = useCallback((v: number) => {
    setVolume(v)
    engineRef.current!.setVolume(v)
  }, [])

  const toggleRecord = useCallback(async () => {
    const engine = engineRef.current!
    if (engine.isRecording) {
      // 停止 → 自動でループ素材(WAV)に加工してダウンロード
      if (recTimerRef.current !== null) {
        clearInterval(recTimerRef.current)
        recTimerRef.current = null
      }
      setRecording(false)
      setProcessing(true)
      const result = await engine.stopRecording()
      if (result) {
        const stamp = timestamp()
        try {
          const ctx = engine.getAudioContext()
          if (!ctx) throw new Error('no audio context')
          const wav = await makeLoopWav(result.blob, ctx)
          downloadBlob(wav, `tape-echo-loop-${stamp}.wav`)
        } catch {
          // 加工に失敗したら素の録音をそのまま落とす
          downloadBlob(result.blob, `tape-echo-${stamp}.${result.ext}`)
        }
      }
      setProcessing(false)
    } else {
      // 開始
      if (engine.startRecording()) {
        setRecording(true)
        setRecSeconds(0)
        recTimerRef.current = window.setInterval(() => setRecSeconds((s) => s + 1), 1000)
      }
    }
  }, [])

  return (
    <div className="stage">
      <TapeEcho
        playing={playing}
        muted={muted}
        params={params}
        activePreset={activePreset}
        raining={raining}
        rainLevel={rainLevel}
        volume={volume}
        onTogglePlay={togglePlay}
        onToggleMute={toggleMute}
        onParamChange={handleParamChange}
        onPreset={handlePreset}
        onToggleRain={toggleRain}
        onRainLevel={handleRainLevel}
        onVolume={handleVolume}
        recording={recording}
        recSeconds={recSeconds}
        processing={processing}
        onToggleRecord={toggleRecord}
      />
      <p className="hint">
        ▶ PLAY で再生。ツマミを回すと音のテイストが変わります（ドラッグ／ホイール）。
      </p>
    </div>
  )
}
