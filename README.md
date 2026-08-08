# HotKey Gesture 🖐️→⌨️

Control your computer with hand gestures. HotKey Gesture watches your webcam, recognizes hand
gestures with on-device ML, and fires configurable keyboard shortcuts — a thumbs-up can switch
apps, an open palm can play/pause, a peace sign can open a new tab.

Everything runs **locally** in a desktop app (Electron + [MediaPipe](https://developers.google.com/mediapipe)
hand tracking). No frames or data ever leave your machine.

## Features

- **8 gestures out of the box** — ✋ open palm, ✊ fist, ☝️ point up, 👍 thumbs up, 👎 thumbs
  down, ✌️ peace, 🤟 rock on, plus a landmark-derived 🤏 pinch.
- **Fully configurable** — map any gesture to any shortcut with a click-to-record hotkey
  field, enable/disable rows, add/remove mappings. Tuning knobs for hold time, cooldown,
  confidence threshold, and smoothing.
- **Debug / tutorial viewer** — live camera preview with the hand skeleton drawn on top, a
  hold-progress ring around your hand, per-row "recognized" glow, a practice guide with tips
  for every gesture, and an activity log of every trigger.
- **Behaves like you'd expect** — a gesture must be *held* briefly to fire (no accidental
  triggers), fires once per hold (release to re-arm, or enable repeat), and has a per-gesture
  cooldown. Recognition is smoothed over a sliding window so one flickery frame never resets
  your hold.
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
raw frames → confidence gate → majority-vote smoothing → hold timer → trigger → cooldown
                                                            ↑                      |
                                                            └──── release re-arms ─┘
```

- **Hold time** (default 250 ms): the gesture must be held steadily before it fires.
- **Cooldown** (default 750 ms): minimum gap between two triggers of the same gesture.
- **Release to re-trigger** (default on): drop the gesture before it can fire again. Turn it
  off to auto-repeat every cooldown interval while held.
- **Smoothing** (default 5 frames): the detected gesture only changes when a new label wins a
  majority of the sliding window — single misclassified frames are ignored.

All of it is adjustable in **Settings**, per-mapping overrides (`holdMs`, `cooldownMs`) are
supported in the config file.

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
| Hand tracking | renderer | MediaPipe `GestureRecognizer` (wasm, GPU w/ CPU fallback) |
| Gesture engine | `src/shared` | smoothing, hold, cooldown, release re-arm |
| Keystroke synthesis | main process | AppleScript / xdotool / SendKeys per platform |
| Config persistence | main process | atomic JSON writes in userData |
| UI | renderer | React, live overlay canvas, tutorial guide |
