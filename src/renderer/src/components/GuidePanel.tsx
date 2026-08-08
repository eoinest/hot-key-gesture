import { GESTURES } from '../../../shared/gestures'
import type { GestureName } from '../../../shared/types'

interface GuidePanelProps {
  stable: GestureName | null
}

export function GuidePanel({ stable }: GuidePanelProps) {
  return (
    <div className="guide">
      <p className="panel-hint">
        Practice here. Hold a gesture steady, facing the camera, about arm's length away — its
        card lights up while it's recognized. Switch to <b>Test</b> mode to watch full triggers
        (hold + cooldown) without sending real keystrokes.
      </p>
      <div className="guide-grid">
        {GESTURES.map((g) => {
          const active = stable === g.name
          return (
            <div key={g.name} className={`guide-card ${active ? 'active' : ''}`}>
              <span className="guide-emoji">{g.emoji}</span>
              <div className="guide-name">{g.label}</div>
              <div className="guide-tip">{g.tip}</div>
              <div className={`guide-detected ${active ? 'show' : ''}`}>Recognized ✓</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
