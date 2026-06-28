// 生成型アンビエント音エンジン。外部音源を持たず Web Audio API で合成する。
// small-world のBGM（ドローン＋ペンタトニックのパッド＋自作リバーブ）を、
// 再生中でもパラメータをリアルタイムに変えられる形にしたもの。

/** スケール（半音オフセット）。Mood ツマミで切り替える。 */
export const SCALES: { id: string; label: string; offsets: number[] }[] = [
  { id: 'melancholy', label: 'Melancholy', offsets: [0, 3, 5, 7, 10] }, // マイナーペンタ
  { id: 'bright', label: 'Bright', offsets: [0, 2, 4, 7, 9] }, // メジャーペンタ
  { id: 'dreamy', label: 'Dreamy', offsets: [0, 2, 4, 7, 11] }, // メジャー7th 系
  { id: 'mystic', label: 'Mystic', offsets: [0, 2, 5, 7, 9] }, // サスっぽい浮遊感
]

/** 外から調整できるパラメータ。mood 以外は 0..1 に正規化。 */
export interface EngineParams {
  mood: number // SCALES のインデックス
  density: number // 音の密度（0=疎 / 1=密）
  reverb: number // 残響の深さ（0..1）
  tone: number // 音色の明るさ（0=こもり / 1=きらびやか）
  pitch: number // 全体の高さ（0=低い / 1=高い）
}

export const DEFAULT_PARAMS: EngineParams = {
  mood: 0,
  density: 0.5,
  reverb: 0.6,
  tone: 0.5,
  pitch: 0.5,
}

const MASTER_VOLUME = 0.22

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** ノイズの指数減衰でリバーブ用インパルス応答を作る。 */
function makeReverbBuffer(ac: AudioContext): AudioBuffer {
  const len = Math.floor(ac.sampleRate * 3)
  const buffer = ac.createBuffer(2, len, ac.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5)
    }
  }
  return buffer
}

export class AmbientEngine {
  private ctx: AudioContext | null = null
  private params: EngineParams = { ...DEFAULT_PARAMS }
  private running = false
  private muted = false
  private volume = 0.8 // 全体ボリューム（0..1）

  // 出力段：sources → volumeGain（音量）→ muteGain（ミュート）→ destination。
  // 録音は volumeGain から分岐するため、ミュート（モニター用）の影響を受けない。
  private volumeGain: GainNode | null = null
  private muteGain: GainNode | null = null

  // 録音（MediaRecorder）
  private recordDest: MediaStreamAudioDestinationNode | null = null
  private recorder: MediaRecorder | null = null
  private recChunks: Blob[] = []
  private recMime = ''

  // 音楽の永続ノード（再生中に値だけ書き換える）
  private master: GainNode | null = null
  private bus: GainNode | null = null
  private wet: GainNode | null = null
  private droneFilter: BiquadFilterNode | null = null
  private droneOscs: OscillatorNode[] = []
  private noteTimer: number | null = null

  // 雨レイヤー（音楽とは独立して鳴らせる）
  private rainOn = false
  private rainLevel = 0.5
  private rainNoise: AudioBufferSourceNode | null = null
  private rainLfo: OscillatorNode | null = null
  private rainGain: GainNode | null = null // 全体の強さ（0..）
  private rainLowpass: BiquadFilterNode | null = null
  private dropTimer: number | null = null

  get isRunning() {
    return this.running
  }

  get isRaining() {
    return this.rainOn
  }

  get isRecording() {
    return this.recorder?.state === 'recording'
  }

  /** デコード等に使う AudioContext を返す（無ければ生成）。 */
  getAudioContext(): AudioContext | null {
    return this.getCtx()
  }

  /** ルート周波数（pitch から算出）。 */
  private get root() {
    return lerp(150, 300, this.params.pitch)
  }

  private getCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** 出力段を用意し、音源を繋ぐノード(volumeGain)を返す。音楽・雨の両方がここに繋がる。 */
  private ensureOutput(ac: AudioContext): GainNode {
    if (!this.muteGain) {
      this.muteGain = ac.createGain()
      this.muteGain.gain.value = this.muted ? 0 : 1
      this.muteGain.connect(ac.destination)
      this.volumeGain = ac.createGain()
      this.volumeGain.gain.value = this.volume
      this.volumeGain.connect(this.muteGain)
    }
    return this.volumeGain!
  }

  /** 再生開始。ブラウザの制限によりユーザー操作後に呼ぶこと。 */
  start() {
    if (this.running) return
    const ac = this.getCtx()
    if (!ac) return
    this.running = true
    const out = this.ensureOutput(ac)

    // 音楽のマスター（フェードイン/アウト・音量）
    this.master = ac.createGain()
    this.master.gain.value = 0
    this.master.connect(out)
    this.master.gain.setTargetAtTime(MASTER_VOLUME, ac.currentTime, 1.5)

    // バス：ドライ＋リバーブを混ぜて master へ
    this.bus = ac.createGain()
    const reverb = ac.createConvolver()
    reverb.buffer = makeReverbBuffer(ac)
    this.wet = ac.createGain()
    this.wet.gain.value = this.params.reverb
    this.bus.connect(this.master) // ドライ
    this.bus.connect(reverb)
    reverb.connect(this.wet)
    this.wet.connect(this.master) // ウェット

    this.startDrone(ac)
    this.scheduleNotes(ac)
  }

  /** 停止。ゆっくりフェードアウトしてからノードを破棄する。 */
  stop() {
    if (!this.running) return
    const ac = this.ctx
    this.running = false
    if (this.noteTimer !== null) {
      clearTimeout(this.noteTimer)
      this.noteTimer = null
    }
    if (ac && this.master) {
      const now = ac.currentTime
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setTargetAtTime(0, now, 0.6)
    }
    // フェードアウト後に発振を止める
    const oscs = this.droneOscs
    this.droneOscs = []
    window.setTimeout(() => {
      oscs.forEach((o) => {
        try {
          o.stop()
        } catch {
          // すでに停止済みなら無視
        }
      })
    }, 2500)
    this.master = null
    this.bus = null
    this.wet = null
    this.droneFilter = null
  }

  setMuted(m: boolean) {
    this.muted = m
    const ac = this.ctx
    // モニター用のミュート（録音には影響しない）
    if (this.muteGain && ac) {
      const now = ac.currentTime
      this.muteGain.gain.cancelScheduledValues(now)
      this.muteGain.gain.setTargetAtTime(m ? 0 : 1, now, 0.4)
    }
  }

  /** 全体ボリューム（0..1）。音楽・雨をまとめて調整する（録音にも反映）。 */
  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v))
    const ac = this.ctx
    if (this.volumeGain && ac) {
      this.volumeGain.gain.setTargetAtTime(this.volume, ac.currentTime, 0.15)
    }
  }

  // ============================================================
  // 録音（MediaRecorder で出力をキャプチャ → ダウンロード）
  // ============================================================

  /** 録音開始。鳴っている音（音量適用後・ミュート前）をそのまま録る。 */
  startRecording(): boolean {
    if (typeof MediaRecorder === 'undefined') return false
    const ac = this.getCtx()
    if (!ac) return false
    const out = this.ensureOutput(ac)
    if (!this.recordDest) {
      this.recordDest = ac.createMediaStreamDestination()
      out.connect(this.recordDest)
    }
    if (this.recorder?.state === 'recording') return true

    // 環境がサポートする形式を選ぶ（Chrome=webm/opus, Safari=mp4 など）
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
    this.recMime = candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
    this.recChunks = []
    this.recorder = this.recMime
      ? new MediaRecorder(this.recordDest.stream, { mimeType: this.recMime })
      : new MediaRecorder(this.recordDest.stream)
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recChunks.push(e.data)
    }
    this.recorder.start()
    return true
  }

  /** 録音停止。録れた音声を Blob（と拡張子）で返す。録音していなければ null。 */
  stopRecording(): Promise<{ blob: Blob; ext: string } | null> {
    const rec = this.recorder
    if (!rec || rec.state !== 'recording') return Promise.resolve(null)
    return new Promise((resolve) => {
      rec.onstop = () => {
        const type = this.recMime || 'audio/webm'
        const blob = new Blob(this.recChunks, { type })
        this.recChunks = []
        this.recorder = null
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
        resolve({ blob, ext })
      }
      rec.stop()
    })
  }

  /** パラメータを更新。再生中ならライブで反映する。 */
  setParams(next: Partial<EngineParams>) {
    this.params = { ...this.params, ...next }
    const ac = this.ctx
    if (!ac || !this.running) return
    const now = ac.currentTime

    // 残響の深さ
    if (this.wet) this.wet.gain.setTargetAtTime(this.params.reverb, now, 0.2)

    // 音色（ローパスの基準カットオフ）と高さ（ドローンのルート）
    if (this.droneFilter) {
      this.droneFilter.frequency.setTargetAtTime(this.droneBaseCutoff(), now, 0.2)
    }
    const droneFreqs = [this.root / 2, (this.root / 2) * 1.5]
    this.droneOscs.forEach((osc, i) => {
      const f = droneFreqs[i % 2]
      if (f) osc.frequency.setTargetAtTime(f, now, 0.3)
    })
    // density / mood は次のスケジュール時に params から読まれる（即時の再設定は不要）
  }

  getParams(): EngineParams {
    return { ...this.params }
  }

  // ============================================================
  // 雨（環境音レイヤー）。音楽とは独立して on/off できる。
  // ============================================================

  /** 雨の on/off。on にすると（音楽が止まっていても）雨音が鳴り出す。 */
  setRain(on: boolean) {
    if (on === this.rainOn) return
    this.rainOn = on
    if (on) this.startRain()
    else this.stopRain()
  }

  /** 雨の強さ（0=小雨 / 1=土砂降り）。鳴っている間はライブで反映。 */
  setRainLevel(level: number) {
    this.rainLevel = Math.min(1, Math.max(0, level))
    const ac = this.ctx
    if (!ac || !this.rainOn) return
    const now = ac.currentTime
    if (this.rainGain) this.rainGain.gain.setTargetAtTime(this.rainTargetGain(), now, 0.3)
    // 強い雨ほど明るく（高域が増す）
    if (this.rainLowpass)
      this.rainLowpass.frequency.setTargetAtTime(lerp(2600, 8500, this.rainLevel), now, 0.3)
  }

  private rainTargetGain() {
    return lerp(0.06, 0.4, this.rainLevel)
  }

  private startRain() {
    const ac = this.getCtx()
    if (!ac) return
    const out = this.ensureOutput(ac)

    // ループ用のホワイトノイズ（2秒ぶんを繰り返す）
    const len = Math.floor(ac.sampleRate * 2)
    const buffer = ac.createBuffer(1, len, ac.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const noise = ac.createBufferSource()
    noise.buffer = buffer
    noise.loop = true

    // 高域の地鳴りを削り（HP）、強さで開くローパス（LP）で「サーッ」を作る
    const hp = ac.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 400
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = lerp(2600, 8500, this.rainLevel)
    this.rainLowpass = lp

    // 全体の強さ（0からフェードイン）
    const gain = ac.createGain()
    gain.gain.value = 0
    gain.gain.setTargetAtTime(this.rainTargetGain(), ac.currentTime, 1.2)
    this.rainGain = gain

    noise.connect(hp)
    hp.connect(lp)
    lp.connect(gain)
    gain.connect(out)

    // ゆっくりした強弱（雨脚の揺らぎ）を LFO でローパスに与える
    const lfo = ac.createOscillator()
    const lfoGain = ac.createGain()
    lfo.frequency.value = 0.08
    lfoGain.gain.value = 600
    lfo.connect(lfoGain)
    lfoGain.connect(lp.frequency)
    lfo.start()

    noise.start()
    this.rainNoise = noise
    this.rainLfo = lfo

    this.scheduleDrops(ac)
  }

  private stopRain() {
    const ac = this.ctx
    if (this.dropTimer !== null) {
      clearTimeout(this.dropTimer)
      this.dropTimer = null
    }
    if (ac && this.rainGain) {
      const now = ac.currentTime
      this.rainGain.gain.cancelScheduledValues(now)
      this.rainGain.gain.setTargetAtTime(0, now, 0.6)
    }
    const noise = this.rainNoise
    const lfo = this.rainLfo
    this.rainNoise = null
    this.rainLfo = null
    this.rainGain = null
    this.rainLowpass = null
    // フェードアウト後に停止
    window.setTimeout(() => {
      try {
        noise?.stop()
      } catch {
        // 無視
      }
      try {
        lfo?.stop()
      } catch {
        // 無視
      }
    }, 2000)
  }

  /** 雨だれ（ぽつ…）をランダムな間隔で控えめに鳴らす。強い雨ほど頻繁。 */
  private scheduleDrops(ac: AudioContext) {
    if (!this.rainOn || !this.rainGain) return
    // 短いノイズ片をバンドパスで弾いて水滴っぽい質感に
    const out = this.rainGain
    const now = ac.currentTime
    const burstLen = Math.floor(ac.sampleRate * 0.05)
    const buffer = ac.createBuffer(1, burstLen, ac.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < burstLen; i++) data[i] = Math.random() * 2 - 1
    const src = ac.createBufferSource()
    src.buffer = buffer
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1500 + Math.random() * 2500
    bp.Q.value = 6
    const g = ac.createGain()
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(0.06 + this.rainLevel * 0.1, now + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
    const pan = ac.createStereoPanner()
    pan.pan.value = Math.random() * 1.4 - 0.7
    src.connect(bp)
    bp.connect(g)
    g.connect(pan)
    pan.connect(out)
    src.start(now)
    src.stop(now + 0.2)

    // 強い雨ほど間隔を詰める（小雨: 約0.5〜1.3秒 / 強雨: 約0.08〜0.4秒）
    const min = lerp(500, 80, this.rainLevel)
    const span = lerp(800, 320, this.rainLevel)
    this.dropTimer = window.setTimeout(() => this.scheduleDrops(ac), min + Math.random() * span)
  }

  // --- 内部 ---

  private droneBaseCutoff() {
    return lerp(350, 1800, this.params.tone)
  }

  private offsetToFreq(semitone: number) {
    return this.root * Math.pow(2, semitone / 12)
  }

  /** 低い持続音（ルート＋5度）。ゆっくり動くローパスで揺らぎを出す。 */
  private startDrone(ac: AudioContext) {
    const filter = ac.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = this.droneBaseCutoff()
    this.droneFilter = filter

    const droneGain = ac.createGain()
    droneGain.gain.value = 0.07
    filter.connect(droneGain)
    if (this.bus) droneGain.connect(this.bus)

    const base = this.root / 2
    ;[base, base * 1.5].forEach((f, i) => {
      const osc = ac.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = f
      osc.detune.value = i === 0 ? -4 : 4
      osc.connect(filter)
      osc.start()
      this.droneOscs.push(osc)
    })

    // カットオフをゆっくり揺らす LFO
    const lfo = ac.createOscillator()
    const lfoGain = ac.createGain()
    lfo.frequency.value = 0.05
    lfoGain.gain.value = 250
    lfo.connect(lfoGain)
    lfoGain.connect(filter.frequency)
    lfo.start()
    this.droneOscs.push(lfo)
  }

  /** やわらかいパッド音を1音鳴らす（長いアタック/リリース＋ランダムなパン）。 */
  private playPad(ac: AudioContext, semitone: number) {
    if (!this.bus) return
    const now = ac.currentTime
    const freq = this.offsetToFreq(semitone)
    const osc = ac.createOscillator()
    const osc2 = ac.createOscillator()
    const gain = ac.createGain()
    const pan = ac.createStereoPanner()

    osc.type = 'triangle'
    osc2.type = 'sine'
    osc.frequency.value = freq
    osc2.frequency.value = freq
    osc2.detune.value = 6 // 軽いデチューンで厚みを出す
    pan.pan.value = Math.random() * 1.2 - 0.6

    const attack = 1.5
    const hold = 1.5 + Math.random() * 2
    const release = 3.5
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.14, now + attack)
    gain.gain.setValueAtTime(0.14, now + attack + hold)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + hold + release)

    osc.connect(gain)
    osc2.connect(gain)
    gain.connect(pan)
    pan.connect(this.bus)

    const stopAt = now + attack + hold + release + 0.1
    osc.start(now)
    osc2.start(now)
    osc.stop(stopAt)
    osc2.stop(stopAt)
    osc.onended = () => {
      gain.disconnect()
      pan.disconnect()
    }
  }

  /** 次の音を鳴らし、密度に応じた間隔で自分を再スケジュールする。 */
  private scheduleNotes(ac: AudioContext) {
    if (!this.running) return
    const scale = SCALES[this.params.mood] ?? SCALES[0]
    const offsets = scale.offsets

    const octave = 12 * Math.floor(Math.random() * 2) // 0 or 12
    this.playPad(ac, offsets[Math.floor(Math.random() * offsets.length)] + octave)
    // 密度が高いほど2音重ねの確率が上がる
    if (Math.random() < 0.2 + this.params.density * 0.4) {
      this.playPad(ac, offsets[Math.floor(Math.random() * offsets.length)] + 12)
    }

    // 密度が高いほど間隔を短く（疎: 約2.5〜8.5秒 / 密: 約1〜3.5秒）
    const min = lerp(2500, 1000, this.params.density)
    const span = lerp(6000, 2500, this.params.density)
    const wait = min + Math.random() * span
    this.noteTimer = window.setTimeout(() => this.scheduleNotes(ac), wait)
  }
}
