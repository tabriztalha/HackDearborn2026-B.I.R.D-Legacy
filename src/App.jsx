import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

const TAP_COOLDOWN_MS = 5000
const BUCKET_MS = 30_000 // 30s buckets for the spike timeline

function bucketize(taps, sessionStart) {
  const buckets = []
  const now = Date.now()
  const count = Math.max(1, Math.ceil((now - sessionStart) / BUCKET_MS))
  for (let i = 0; i < count; i++) buckets.push(0)
  for (const t of taps) {
    const i = Math.floor((t - sessionStart) / BUCKET_MS)
    if (i >= 0 && i < buckets.length) buckets[i]++
  }
  return buckets
}

function StudentView({ onBack }) {
  const [cooldown, setCooldown] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => () => clearInterval(timerRef.current), [])

  async function tap() {
    if (cooldown > 0) return
    await supabase.from('taps').insert({})
    setCooldown(TAP_COOLDOWN_MS / 1000)
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  return (
    <section className="view student-view">
      <button type="button" className="link-back" onClick={onBack}>
        ← back
      </button>
      <div className="brand">
        <span className="brand-badge">🎧</span>
        <h1>TuneIn</h1>
      </div>
      <p className="hint">Lost in the lecture? Tap. It's anonymous.</p>
      <div className={`tap-ring ${cooldown > 0 ? 'sent' : ''}`}>
        <button
          type="button"
          className={`tap-button ${cooldown > 0 ? 'sent' : ''}`}
          onClick={tap}
          disabled={cooldown > 0}
        >
          {cooldown > 0 ? `Sent ✓ ${cooldown}s` : "I'm lost"}
        </button>
      </div>
    </section>
  )
}

function ProfessorView({ onBack }) {
  const [taps, setTaps] = useState([])
  const sessionStart = useRef(Date.now()).current

  useEffect(() => {
    supabase
      .from('taps')
      .select('created_at')
      .gte('created_at', new Date(sessionStart).toISOString())
      .then(({ data }) => setTaps((data ?? []).map((r) => Date.parse(r.created_at))))

    const channel = supabase
      .channel('taps-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'taps' }, (payload) => {
        setTaps((prev) => [...prev, Date.parse(payload.new.created_at)])
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [sessionStart])

  async function reset() {
    await supabase.from('taps').delete().gte('created_at', new Date(sessionStart).toISOString())
    setTaps([])
  }

  const recentCount = taps.filter((t) => Date.now() - t < 15_000).length
  const buckets = bucketize(taps, sessionStart)
  const max = Math.max(1, ...buckets)
  const peakIndex = buckets.indexOf(max)

  return (
    <section className="view professor-view">
      <button type="button" className="link-back" onClick={onBack}>
        ← back
      </button>
      <div className="brand">
        <span className="brand-badge">📡</span>
        <h1>Live confusion</h1>
      </div>

      <div className={`card stat-card ${recentCount > 0 ? 'hot' : ''}`}>
        <div className="live-count">{recentCount}</div>
        <span className="stat-label">lost in the last 15s</span>
      </div>

      <div className="card timeline-card">
        <div className="card-header">
          <h2>Timeline this session</h2>
          {max > 0 && (
            <span className="pill">
              peak {max} @ {Math.round((peakIndex * BUCKET_MS) / 60_000)}m
            </span>
          )}
        </div>
        <div className="timeline">
          {buckets.map((v, i) => (
            <div
              key={i}
              className={`bar ${i === peakIndex && max > 0 ? 'peak' : ''}`}
              style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
              title={`${v} taps`}
            />
          ))}
        </div>
        <div className="timeline-axis">
          <span>session start</span>
          <span>now</span>
        </div>
      </div>

      <button type="button" className="reset-button" onClick={reset}>
        Reset session
      </button>
    </section>
  )
}

function App() {
  const [view, setView] = useState('select')

  if (view === 'student') return <StudentView onBack={() => setView('select')} />
  if (view === 'professor') return <ProfessorView onBack={() => setView('select')} />

  return (
    <section className="view select-view">
      <div className="brand">
        <span className="brand-badge">🎧</span>
        <h1>TuneIn</h1>
      </div>
      <p className="hint">Know when your class tunes out.</p>
      <div className="choices">
        <button type="button" className="choice-button" onClick={() => setView('student')}>
          <span className="choice-icon">🙋</span>
          <span className="choice-text">
            <strong>I'm a student</strong>
            <small>Tap when you're lost</small>
          </span>
        </button>
        <button type="button" className="choice-button" onClick={() => setView('professor')}>
          <span className="choice-icon">📊</span>
          <span className="choice-text">
            <strong>I'm the professor</strong>
            <small>Watch it live</small>
          </span>
        </button>
      </div>
    </section>
  )
}

export default App
