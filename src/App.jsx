import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { bucketize, countRecent, mergeTaps } from './taps'
import './App.css'

const TAP_COOLDOWN_MS = 5000
const LIVE_WINDOW_MS = 15_000 // demo value; a real lecture would use about 60s
const BUCKET_MS = 30_000 // 30s buckets for the spike timeline
const SESSION_KEY = 'tunein-session-start'
const SESSION_MAX_MS = 3 * 60 * 60 * 1000 // older saved sessions are treated as finished

function startNewSession() {
  const start = Date.now()
  try {
    localStorage.setItem(SESSION_KEY, String(start))
  } catch {
    // storage blocked: the session just won't survive a reload
  }
  return start
}

function loadSessionStart() {
  try {
    const saved = Number(localStorage.getItem(SESSION_KEY))
    if (saved > Date.now() - SESSION_MAX_MS) return saved
  } catch {
    // storage blocked: fall through to a fresh session
  }
  return startNewSession()
}

function formatElapsed(ms) {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function StudentView({ onBack }) {
  const [cooldown, setCooldown] = useState(0)
  const [failed, setFailed] = useState(false)
  const sendingRef = useRef(false)

  useEffect(() => {
    if (cooldown === 0) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  async function tap() {
    if (sendingRef.current || cooldown > 0) return
    sendingRef.current = true
    const { error } = await supabase.from('taps').insert({})
    sendingRef.current = false
    setFailed(Boolean(error))
    if (!error) setCooldown(TAP_COOLDOWN_MS / 1000)
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
      {failed && (
        <p className="hint error" role="alert">
          Couldn't send. Check your connection and tap again.
        </p>
      )}
    </section>
  )
}

function ProfessorView({ onBack }) {
  const [sessionStart, setSessionStart] = useState(loadSessionStart)
  const [taps, setTaps] = useState([])
  const [now, setNow] = useState(Date.now)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = () =>
      supabase
        .from('taps')
        .select('id, created_at')
        .gte('created_at', new Date(sessionStart).toISOString())
        .then(({ data, error }) => {
          if (cancelled) return
          setProblem(error ? "Couldn't load earlier taps." : '')
          // Server timestamps are clamped into the session so clock skew can't push them off the timeline.
          const loaded = (data ?? []).map((r) => ({
            id: r.id,
            at: Math.min(Date.now(), Math.max(sessionStart, Date.parse(r.created_at))),
          }))
          setTaps((prev) => mergeTaps(prev, loaded))
        })
    load()

    // Unique name: the client reuses a channel with the same topic, which breaks on StrictMode's double mount.
    const channel = supabase
      .channel(`taps-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'taps' }, (payload) => {
        // Arrival time on this machine, so the live window doesn't depend on the server clock.
        setTaps((prev) => mergeTaps(prev, [{ id: payload.new.id, at: Date.now() }]))
      })
      // The database feed goes live a moment after the channel joins; taps in that gap are never
      // delivered, so reload once it confirms (this also covers reconnects).
      .on('system', {}, (msg) => {
        if (msg.extension === 'postgres_changes' && msg.status === 'ok') load()
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [sessionStart])

  async function reset() {
    const { error } = await supabase
      .from('taps')
      .delete()
      .gte('created_at', new Date(sessionStart).toISOString())
    if (error) {
      setProblem("Couldn't reset the session.")
      return
    }
    setTaps([])
    setNow(Date.now())
    setSessionStart(startNewSession())
  }

  const recentCount = countRecent(taps, now, LIVE_WINDOW_MS)
  const buckets = bucketize(taps, sessionStart, now, BUCKET_MS)
  const peak = Math.max(0, ...buckets)
  const scale = Math.max(1, peak)
  const peakIndex = buckets.indexOf(peak)

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
        <span className="stat-label">lost in the last {LIVE_WINDOW_MS / 1000}s</span>
        <span className="stat-total">{taps.length} total this session</span>
      </div>
      {problem && (
        <p className="hint error" role="alert">
          {problem}
        </p>
      )}

      <div className="card timeline-card">
        <div className="card-header">
          <h2>Timeline this session</h2>
          {peak > 0 && (
            <span className="pill">
              peak {peak} @ {formatElapsed(peakIndex * BUCKET_MS)}
            </span>
          )}
        </div>
        <div className="timeline">
          {buckets.map((v, i) => (
            <div
              key={i}
              className={`bar ${i === peakIndex && peak > 0 ? 'peak' : ''}`}
              style={{ height: `${Math.max(4, (v / scale) * 100)}%` }}
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
