// 録音した音声を「シームレスにループできる素材」に自動加工して WAV で書き出す。
//  1. Blob をデコードして波形(AudioBuffer)にする
//  2. 前後の無音（フェードイン部など）を自動トリム
//  3. 末尾を先頭に等パワークロスフェードで重ねて、ループの継ぎ目を滑らかにする
//  4. 16bit PCM の WAV にエンコード

interface LoopOptions {
  /** クロスフェード長(秒)。長いほど継ぎ目がなめらか。素材長に応じて自動で縮む。 */
  xfadeSec?: number
}

/** 録音 Blob → シームレスループの WAV Blob。 */
export async function makeLoopWav(
  blob: Blob,
  ctx: BaseAudioContext,
  opts: LoopOptions = {},
): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer()
  const decoded = await ctx.decodeAudioData(arrayBuffer)
  const looped = makeSeamlessLoop(ctx, decoded, opts)
  return encodeWav(looped)
}

/** 前後の無音をトリムし、末尾→先頭のクロスフェードでループ化した AudioBuffer を返す。 */
function makeSeamlessLoop(
  ctx: BaseAudioContext,
  buf: AudioBuffer,
  { xfadeSec = 2 }: LoopOptions,
): AudioBuffer {
  const sr = buf.sampleRate
  const ch = buf.numberOfChannels
  const chans: Float32Array[] = []
  let peak = 1e-6
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c)
    chans.push(d)
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i])
      if (a > peak) peak = a
    }
  }

  // ピーク比 2% を下回る前後を「無音」としてトリム
  const thresh = peak * 0.02
  let start = 0
  let end = buf.length
  loopStart: for (let i = 0; i < buf.length; i++) {
    for (let c = 0; c < ch; c++) {
      if (Math.abs(chans[c][i]) > thresh) {
        start = i
        break loopStart
      }
    }
  }
  loopEnd: for (let i = buf.length - 1; i >= 0; i--) {
    for (let c = 0; c < ch; c++) {
      if (Math.abs(chans[c][i]) > thresh) {
        end = i + 1
        break loopEnd
      }
    }
  }
  // トリムし過ぎ・短すぎる場合は全体を使う（安全策）
  if (end - start < sr * 0.5) {
    start = 0
    end = buf.length
  }

  const len = end - start
  let xfade = Math.min(Math.floor(xfadeSec * sr), Math.floor(len * 0.4))
  if (xfade < 1) xfade = 0
  const outLen = Math.max(1, len - xfade)

  const out = ctx.createBuffer(ch, outLen, sr)
  for (let c = 0; c < ch; c++) {
    const src = chans[c]
    const o = out.getChannelData(c)
    // 定常部をコピー
    for (let i = 0; i < outLen; i++) o[i] = src[start + i]
    // 先頭 xfade に「末尾 xfade」を等パワーで重ねる → ループ点が連続＆なめらかに
    for (let i = 0; i < xfade; i++) {
      const t = i / xfade
      const fin = Math.sin((t * Math.PI) / 2)
      const fout = Math.cos((t * Math.PI) / 2)
      o[i] = src[start + i] * fin + src[start + outLen + i] * fout
    }
  }
  return out
}

/** AudioBuffer → 16bit PCM の WAV Blob。 */
function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels
  const sr = buf.sampleRate
  const len = buf.length
  const blockAlign = ch * 2 // 16bit = 2byte
  const dataSize = len * blockAlign
  const ab = new ArrayBuffer(44 + dataSize)
  const dv = new DataView(ab)

  let p = 0
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(p++, s.charCodeAt(i))
  }
  const w32 = (v: number) => {
    dv.setUint32(p, v, true)
    p += 4
  }
  const w16 = (v: number) => {
    dv.setUint16(p, v, true)
    p += 2
  }

  // RIFF ヘッダ
  writeStr('RIFF')
  w32(36 + dataSize)
  writeStr('WAVE')
  // fmt チャンク
  writeStr('fmt ')
  w32(16)
  w16(1) // PCM
  w16(ch)
  w32(sr)
  w32(sr * blockAlign) // byte rate
  w16(blockAlign)
  w16(16) // bits per sample
  // data チャンク
  writeStr('data')
  w32(dataSize)

  const chans: Float32Array[] = []
  for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c))
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]))
      dv.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      p += 2
    }
  }
  return new Blob([ab], { type: 'audio/wav' })
}
