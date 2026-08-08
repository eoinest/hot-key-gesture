# HotKey Gesture 🖐️→⌨️

Control your computer with hand gestures. HotKey Gesture watches your webcam, recognizes hand
gestures with on-device ML, and fires configurable keyboard shortcuts — a thumbs-up can switch
apps, an open palm can play/pause, a peace sign can open a new tab.

Everything runs **locally** in a desktop app (Electron + [MediaPipe](https://developers.google.com/mediapipe)
hand tracking). No frames or data ever leave your machine.

## Features

- **Two-hand safety guard** (on by default) — nothing fires unless **one hand holds the arm
  gesture (✊ fist)** while your **other hand** makes the action gesture. Ordinary one-handed
  movement in front of your webcam can't trigger anything.
- **8 gestures out of the box** — ✋ open palm, ✊ fist, ☝️ point up, 👍 thumbs up, 👎 thumbs
  down, ✌️ peace, 🤟 rock on, plus a landmark-derived 🤏 pinch.
- **Fully configurable** — map any gesture to any shortcut with a click-to-record hotkey
  field, enable/disable rows, add/remove mappings. Tuning knobs for the arm gesture, hold
  time, repeat interval, confidence threshold, and smoothing. The guard can be switched off
  for one-handed use.
- **Audible confirmation** — a short boop plays when a shortcut fires (and a duller tone if
  it fails), so you know it worked without looking at the app. Toggle and volume in Settings.
- **Debug / tutorial viewer** — live preview with both hands skeleton-tracked and
  colour-coded by role (amber = arming, blue = acting), a hold-progress ring that fills and
  turns green on fire, an armed/not-armed banner, per-row "recognized" glow, a step-by-step
  practice guide, and an activity log of every trigger.
- **Behaves like you'd expect** — the combination must be *held* for 1 second before it fires,
  then repeats every second while you keep holding it. Recognition is smoothed over a sliding
  window so one flickery frame never resets your hold.
- **Three modes** — **Paused** (preview only), **Test** (full pipeline, keystrokes simulated —
  great for practicing), **Live** (real keystrokes).

## Quick start

```bash
npm install        # also downloads the gesture model (~8 MB) via postinstall
npm run dev
```

Requires Node 20+. The first run downloads the MediaPipe gesture model into
`src/renderer/public/models/` (re-run manually anytime with `npm run setup-assets`).

### macOS permissions

- **Camera** — you'll be prompted on first launch.
- **Accessibility** — required to synthesize keystrokes (System Settings → Privacy &
  Security → Accessibility). In dev, grant it to your terminal/Electron; the app shows a
  warning chip until it's granted. Keystrokes are sent via System Events / AppleScript.

Linux uses `xdotool` (X11); Windows uses PowerShell SendKeys (no Win-key support).

## How triggering works

```
two hands → confidence gate → safety guard → smoothing → hold 1s → FIRE 🔊 → repeat every 1s
                                  │                                              │
                       one hand must hold ✊                        drop either hand to stop
```

1. **Arm** — hold ✊ fist with either hand. The banner turns green and that hand is outlined
   in amber with an `ARMED` label.
2. **Act** — with your *other* hand, make a mapped gesture. That hand is outlined in blue and
   a progress ring appears around it.
3. **Hold 1 second** — the ring fills, the shortcut fires, and you hear a boop. Keep both
   hands up and it repeats every second; drop either hand to stop immediately.

Tunables in **Settings**:

- **Require a second hand** (default on) and **arm gesture** (default ✊ fist). Either hand
  can arm, so it works left- or right-handed.
- **Hold time** (default 1 s) — how long the combination must be held before firing.
- **Repeat interval** (default 1 s) — how long until it fires again while still held. With
  *Release to re-trigger* on instead, it fires once per hold.
- **Confidence threshold** (default 55%) and **smoothing** (default 5 frames): the detected
  gesture only changes when a new label wins a majority of the sliding window, so single
  misclassified frames are ignored.

Per-mapping `holdMs` / `cooldownMs` overrides are supported in the config file.

## Configuration

Everything is editable in the UI and persisted to `config.json` in the app's user-data dir
(`~/Library/Application Support/hot-key-gesture/` on macOS). Mappings look like:

```json
{
  "id": "default-victory",
  "gesture": "Victory",
  "hotkey": { "key": "t", "modifiers": ["cmd"] },
  "enabled": true,
  "holdMs": 400
}
```

## Development

```bash
npm run dev        # hot-reloading dev app
npm run typecheck  # tsc over main/preload/shared + renderer
npm test           # vitest — engine state machine, hotkey parsing, key senders
npm run build      # production build into out/
npm run dist       # package with electron-builder
```

The gesture engine (`src/shared/gestureEngine.ts`) is a pure, deterministic state machine —
time comes in through frame samples — so debounce/cooldown behavior is fully unit-tested.

## Architecture

| Piece | Where | Notes |
| --- | --- | --- |
| Hand tracking | renderer | MediaPipe `GestureRecognizer`, 2 hands (wasm, GPU w/ CPU fallback) |
| Gesture engine | `src/shared` | safety guard, smoothing, hold, repeat, release re-arm |
| Boop | renderer | Web Audio oscillator — no audio assets to ship |
| Keystroke synthesis | main process | AppleScript / xdotool / SendKeys per platform |
| Config persistence | main process | atomic JSON writes in userData |
| UI | renderer | React, live overlay canvas, tutorial guide |
