// Auto-speech is deliberately fed only by completed assistant text parts.
// Streaming deltas, reasoning, tool output and code must never reach the TTS
// engine: apart from being confusing to hear, synthesizing each transient
// chunk can use a substantial amount of CPU and memory.

import { currentSpeakingKey, isVoiceSpeaking, speakAutomaticallyWithVoices, stopSpeaking } from "./voices"

const AUTO_KEY_PREFIX = "auto:"
const MAX_REMEMBERED_PARTS = 200
const MAX_SOURCE_CHARS = 8_000
const MAX_SPOKEN_CHARS = 600
const FAILURE_BACKOFF_MS = 30_000
const MAX_MESSAGE_AGE_MS = 120_000

const seenParts = new Set<string>()
const announcedParts = new Set<string>()

let currentKey: string | undefined
let pending: { key: string; partId: string; text: string } | undefined
let generation = 0
let lastFailureAt = 0

function remember(parts: Set<string>, partId: string) {
  if (parts.has(partId)) return false
  parts.add(partId)
  if (parts.size > MAX_REMEMBERED_PARTS) {
    const oldest = parts.values().next().value
    if (oldest !== undefined) parts.delete(oldest)
  }
  return true
}

function autoKey(partId: string) {
  return `${AUTO_KEY_PREFIX}${partId}`
}

function isNarrativeText(text: string) {
  const compact = text.replace(/\s+/g, " ").trim()
  if (compact.length < 3) return false
  if (!/[\p{L}\p{N}]/u.test(compact)) return false

  // A standalone source block, terminal transcript, or serialized payload is
  // not a visible assistant announcement worth reading aloud.
  if (/^```[\s\S]*```$/u.test(text.trim())) return false
  if (/^(?:\$ |(?:stdout|stderr|traceback|error|warning):|\{[\s\S]*\}|\[[\s\S]*\])$/iu.test(text.trim())) return false
  return true
}

function cutAtBoundary(text: string) {
  if (text.length <= MAX_SPOKEN_CHARS) return text
  const clipped = text.slice(0, MAX_SPOKEN_CHARS)
  const boundary = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("! "), clipped.lastIndexOf("? "), clipped.lastIndexOf("; "))
  if (boundary > MAX_SPOKEN_CHARS / 2) return clipped.slice(0, boundary + 1)
  const word = clipped.lastIndexOf(" ")
  return word > MAX_SPOKEN_CHARS / 2 ? clipped.slice(0, word) : clipped
}

// Normalizes a completed, visible message for speech. Returning undefined is
// intentional: callers should simply skip text that is code or not prose.
export function prepareAutoSpeakText(text: string) {
  if (typeof text !== "string" || text.length > MAX_SOURCE_CHARS || !isNarrativeText(text)) return
  const cleaned = text
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/!?(?:\[([^\]]+)\]\([^)]*\))/gu, "$1")
    .replace(/[`*_>#]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
  if (!isNarrativeText(cleaned)) return
  return cutAtBoundary(cleaned)
}

export function isCompletedAutoSpeakMessage(input: {
  completed?: number
  created: number
  error?: unknown
  summary?: boolean
  now?: number
}) {
  if (input.completed === undefined || input.error || input.summary) return false
  return (input.now ?? Date.now()) - input.created <= MAX_MESSAGE_AGE_MS
}

// Accepts exactly one finalized prose block for each assistant part. At most
// one newer announcement is retained while speech is active; keeping an
// unbounded queue makes the UI keep talking about obsolete work after a busy
// session has moved on.
export function enqueueAutoSpeak(partId: string, text: string) {
  if (announcedParts.has(partId)) return
  if (!remember(seenParts, partId)) return
  const prepared = prepareAutoSpeakText(text)
  if (!prepared || Date.now() - lastFailureAt < FAILURE_BACKOFF_MS) return

  const key = autoKey(partId)
  const active = currentSpeakingKey()
  // Manual speech always wins. Do not interrupt it or save stale automatic
  // narration for later.
  if (active && !active.startsWith(AUTO_KEY_PREFIX)) return

  const next = { key, partId, text: prepared }
  if (currentKey) {
    pending = next
    return
  }
  currentKey = key
  void speakAutomatic(next, generation)
}

async function speakAutomatic(item: { key: string; partId: string; text: string }, expectedGeneration: number) {
  const timeoutPromise = new Promise<string | undefined>((resolve) => setTimeout(() => resolve("timeout"), 30000))
  const error = await Promise.race([speakAutomaticallyWithVoices(item.key, item.text), timeoutPromise])
  if (generation !== expectedGeneration || currentKey !== item.key) return

  currentKey = undefined
  if (error) {
    lastFailureAt = Date.now()
    pending = undefined
    return
  }
  remember(announcedParts, item.partId)

  const next = pending
  pending = undefined
  if (!next) return
  const active = currentSpeakingKey()
  if (active && !active.startsWith(AUTO_KEY_PREFIX)) return
  currentKey = next.key
  void speakAutomatic(next, expectedGeneration)
}

// Stops automatic playback and invalidates any pending synthesis result. It
// intentionally does not stop a manually requested voice preview.
export function stopAutoSpeak() {
  generation += 1
  pending = undefined
  if (currentKey && isVoiceSpeaking(currentKey)) stopSpeaking()
  currentKey = undefined
}
