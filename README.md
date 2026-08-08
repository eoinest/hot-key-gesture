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
- **Move the mouse with your hand** — map a gesture (🤏 pinch by default) to *cursor control*
  instead of a shortcut. Hold it and the pointer follows your pinch around the screen, with
  configurable reach, smoothing, and target display. Release to hand the mouse back.
- **Click without touching anything** — mid-drag, switch the steering hand to ✊ a fist to
  left-click. Return to the pinch to arm the next click.
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

## Install it as an app

Build a real `.app` you can launch from Spotlight or the Applications folder:

```bash
npm install
npm run dist
cp -R "dist/mac-arm64/HotKey Gesture.app" /Applications/
```

Then hit ⌘-Space and type "HotKey Gesture". The bundle is self-contained — model,
wasm runtime, and cursor helper all ship inside it.

The build is unsigned, so if macOS refuses to open it, right-click the app → **Open** once
(or run `xattr -dr com.apple.quarantine "/Applications/HotKey Gesture.app"`). Grant Camera and
Accessibility when asked; those permissions are per-app, so the installed app asks for its own
even if you already granted them while developing.

## Run it from source

```bash
npm install        # also downloads the gesture model (~8 MB) via postinstall
npm run dev
```

Requires Node 20+. The first run downloads the MediaPipe gesture model into
`src/renderer/public/models/` (re-run manually anytime with `npm run setup-assets`) and
compiles the cursor helper with `swiftc` (`npm run build-helper`). Without Xcode command line
tools everything still works except pointer control, and the app says so.

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
- **Dropout tolerance** (default 400 ms): hand tracking loses the hand for a few frames at a
  time, especially mid-pinch where the fingers occlude each other. A dropout shorter than this
  is bridged rather than treated as a release, so a blink doesn't cost you a whole re-hold. The
  HUD marks the gesture `HOLDING` while it's bridging.

Per-mapping `holdMs` / `cooldownMs` overrides are supported in the config file.

### Cursor control

A mapping whose action is `mouse` behaves differently from a hotkey: instead of firing once,
it **engages** after the hold and then steers the cursor continuously until you release.

- The cursor follows the midpoint between your thumb and index fingertips — literally where
  the pinch is — on the hand that *isn't* arming the guard.
- **Reach** controls how much of the camera frame maps to the whole display. The default maps
  the centre 60%, so you can reach screen corners without leaving the frame.
- **Cursor smoothing** is an exponential filter over the pinch position; raise it if the
  pointer jitters, lower it if it feels laggy.
- Multi-monitor: pick which display the frame maps onto. Defaults to the primary display.
- In **Test** mode the cursor is *not* moved — the overlay draws a `CURSOR` crosshair showing
  where it would go, so you can practise safely.
- Pinch detection is a Schmitt trigger: it takes a tighter pinch to start (0.32 of palm width)
  than to keep going (0.48), so the pointer doesn't let go every time your fingers drift. If
  the hand disappears mid-drag the cursor freezes in place until tracking recovers or the
  dropout tolerance runs out.
- MediaPipe has no pinch class, so the pinch comes from the landmarks — but only when the
  classifier has no confident answer. Measuring real hands showed a pinch and a fist are
  nearly identical geometrically (people curl the other fingers during a pinch, so
  "middle/ring/pinky extended" does *not* separate them), while MediaPipe recognizes a fist
  reliably. Deferring to a confident classification is what keeps the arming hand from
  registering as a pinch.

**Clicking.** While steering, switching the moving hand to the **click gesture** (✊ fist by
default) left-clicks where the cursor sits. It needs two consecutive frames, so a single
misread can't click, and you must return to the pinch before it will click again — holding a
fist gives you one click, not a stream. The click gesture is allowed to match the arm gesture
because hand roles are locked to *handedness* for the life of a session, so a fist on the
steering hand is never mistaken for the arming hand.

Cursor movement goes through a small Swift helper (`native/mouse-helper.swift`) kept alive as
a single process while control is active — spawning one per update would cap the pointer far
below camera frame rate. It posts `CGEvent` mouse-moved events, so macOS Accessibility
permission applies here too.

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
| Cursor control | main process | persistent Swift helper posting `CGEvent` moves (macOS) |
| Config persistence | main process | atomic JSON writes in userData |
| UI | renderer | React, live overlay canvas, tutorial guide |
