import { GESTURES } from '../../../shared/gestures'
import type { GestureName } from '../../../shared/types'

interface GuidePanelProps {
  stable: GestureName | null
  requireArmHand: boolean
  armGestureLabel: string
  armGestureEmoji: string
  holdMs: number
  cooldownMs: number
  repeats: boolean
}

export function GuidePanel({
  stable,
  requireArmHand,
  armGestureLabel,
  armGestureEmoji,
  holdMs,
  cooldownMs,
  repeats,
}: GuidePanelProps) {
  const secs = (ms: number) => `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`
  return (
    <div className="guide">
      {requireArmHand && (
        <div className="guide-steps">
          <div className="guide-step">
            <span className="step-num">1</span>
            <span className="step-emoji">{armGestureEmoji}</span>
            <div>
              <b>Arm it.</b> Hold <b>{armGestureLabel}</b> with one hand. Either hand works.
            </div>
          </div>
          <div className="guide-step">
            <span className="step-num">2</span>
            <span className="step-emoji">🤚</span>
            <div>
              <b>Act.</b> With your <i>other</i> hand, make the gesture you mapped.
            </div>
          </div>
          <div className="guide-step">
            <span className="step-num">3</span>
            <span className="step-emoji">⏱️</span>
            <div>
              <b>Hold {secs(holdMs)}.</b> The ring fills, then the shortcut fires.
              {repeats && ` Keep both hands up and it fires again every ${secs(cooldownMs)}.`}
            </div>
          </div>
        </div>
      )}
      <p className="panel-hint">
        Practice here. Hold a gesture steady, facing the camera, about arm's length away — its
        card lights up while it's recognized. Switch to <b>Test</b> mode to watch full triggers
        without sending real keystrokes.
      </p>
      <div className="guide-grid">
        {GESTURES.map((g) => {
          const active = stable === g.name
          const isArm = requireArmHand && g.label === armGestureLabel
          return (
            <div key={g.name} className={`guide-card ${active ? 'active' : ''} ${isArm ? 'is-arm' : ''}`}>
              <span className="guide-emoji">{g.emoji}</span>
              <div className="guide-name">
                {g.label}
                {isArm && <span className="arm-tag">arm</span>}
              </div>
              <div className="guide-tip">{g.tip}</div>
              <div className={`guide-detected ${active ? 'show' : ''}`}>Recognized ✓</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
