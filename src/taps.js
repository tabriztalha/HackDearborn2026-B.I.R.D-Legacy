export function mergeTaps(prev, incoming) {
  const seen = new Set(prev.map((t) => t.id))
  return [...prev, ...incoming.filter((t) => !seen.has(t.id))]
}

export function bucketize(taps, sessionStart, now, bucketMs) {
  const count = Math.max(1, Math.ceil((now - sessionStart) / bucketMs))
  const buckets = new Array(count).fill(0)
  for (const t of taps) {
    const i = Math.floor((t.at - sessionStart) / bucketMs)
    if (i >= 0 && i < count) buckets[i]++
  }
  return buckets
}

export function countRecent(taps, now, windowMs) {
  return taps.filter((t) => now - t.at < windowMs).length
}
