export interface LogEntry {
  id: number
  time: number
  kind: 'live' | 'test' | 'error' | 'info'
  message: string
}

interface ActivityPanelProps {
  logs: LogEntry[]
  onClear: () => void
}

const KIND_ICONS: Record<LogEntry['kind'], string> = {
  live: '⚡',
  test: '🧪',
  error: '⛔',
  info: 'ℹ️',
}

function formatTime(t: number): string {
  return new Date(t).toLocaleTimeString(undefined, { hour12: false })
}

export function ActivityPanel({ logs, onClear }: ActivityPanelProps) {
  return (
    <div className="activity">
      <div className="activity-head">
        <p className="panel-hint">Triggers and events, newest first.</p>
        <button className="btn small" onClick={onClear} disabled={logs.length === 0}>
          Clear
        </button>
      </div>
      {logs.length === 0 ? (
        <div className="activity-empty">Nothing yet — do a gesture in Test or Live mode.</div>
      ) : (
        <ul className="activity-list">
          {logs.map((entry) => (
            <li key={entry.id} className={`activity-row kind-${entry.kind}`}>
              <span className="activity-icon">{KIND_ICONS[entry.kind]}</span>
              <span className="activity-msg">{entry.message}</span>
              <span className="activity-time">{formatTime(entry.time)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
