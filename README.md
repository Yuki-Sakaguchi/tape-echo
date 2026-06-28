# Tape Echo — Ambient Generator

<img width="500" alt="Tape Echo — Ambient Generator" src="https://github.com/user-attachments/assets/0e403f93-81f0-4105-a360-1f1287f63b0c" />

A browser-based **generative ambient music machine** styled as a vintage tape echo unit.
Everything is synthesized live with the Web Audio API — there are **no audio files**. Turn the
knobs to reshape the sound, overlay rain, watch the reactive visuals on the built-in screen, and
record what you hear straight into a seamless loop.

**Live demo:** https://yuki-sakaguchi.github.io/tape-echo/

## Features

- **Endless generative ambient** — a drone, pentatonic pads, and a hand-built reverb are
  synthesized in real time, so the soundscape never loops or repeats.
- **Five tone knobs** that change the texture instantly while playing.
- **Rain layer** — an independent switch adds synthesized rainfall on top of the music, with its
  own intensity knob. It follows playback (rain only sounds while playing).
- **Presets** — one tap recalls a full mood: Night, Rainy, Space, Morning.
- **Reactive visuals** — flowing aurora waves on the tape screen, driven by every parameter.
- **Record → loop export** — capture the live output and automatically turn it into a seamless,
  download-ready WAV loop.

## Controls

| Control | What it does |
| --- | --- |
| **MOOD** | Switches the musical scale / color palette (Melancholy · Bright · Dreamy · Mystic) |
| **DENSITY** | How often notes play — sparse ↔ busy |
| **REVERB** | Depth of the reverb tail |
| **TONE** | Brightness / sharpness of the sound |
| **PITCH** | Overall pitch height (and visual motion speed) |
| **VOLUME** | Master output level (music + rain) |
| **RAIN** | Toggles the rain layer on/off, with an **AMOUNT** knob for intensity |
| **PRESET** | Recalls a full set of knob values for a given mood |
| **REC** | Starts/stops recording; on stop it exports a seamless loop WAV |

## How it works

- **Audio engine** (`src/audio/engine.ts`) — a sustained drone (root + fifth) through a slowly
  modulated low-pass filter, soft pads picked from a pentatonic scale at randomized intervals and
  stereo positions, all fed through a convolution reverb whose impulse response is generated from
  decaying noise. Parameters update live; the output stage separates volume from a monitor mute so
  recording is never affected by muting your speakers.
- **Rain** (`src/audio/engine.ts`) — looping filtered noise with a slow LFO for natural gusts,
  plus sparse band-passed "droplets" whose density tracks the intensity.
- **Visuals** (`src/components/VisualWindow.tsx`) — a canvas that draws additive aurora ribbons.
  MOOD sets the palette, PITCH the speed, DENSITY the band count, TONE the brightness, REVERB the
  trail length, and VOLUME the amplitude. Rain falls over the top when enabled.
- **Loop export** (`src/audio/loop.ts`) — the recording is decoded to a buffer, leading/trailing
  silence is trimmed, the tail is cross-faded into the head with an equal-power curve for a
  seamless loop point, and the result is encoded as a 16-bit PCM WAV.

## Tech stack

- [React](https://react.dev/) 18 + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/)
- Web Audio API (synthesis, recording via `MediaRecorder`)
- Canvas 2D (visuals)

No external audio or image assets — sound and graphics are generated entirely in code.

## Development

```bash
npm install     # install dependencies
npm run dev     # start the dev server
npm run build   # type-check and build for production
```

Deployed to GitHub Pages automatically on every push to `main` via GitHub Actions.
