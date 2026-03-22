import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'
import { setGlobalOptions } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'

initializeApp()
const db = getFirestore()
setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
})

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 1200
const MAX_PROMPT_CHARS = 30000
const MAX_IMAGE_DATA_URL_CHARS = 6_000_000
const AI_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const AI_RATE_LIMIT_MAX_POINTS = 12
const AI_RATE_LIMIT_COST = {
  text: 1,
  image: 2,
}

function getSecretValue(secret) {
  try {
    return String(secret.value() || '').trim()
  } catch {
    return ''
  }
}

function clampMaxTokens(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 500
  return Math.max(1, Math.min(MAX_TOKENS, Math.round(parsed)))
}

function sanitizePromptInput(value) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .trim()
}

function ensureShortString(value, fieldName, { required = true } = {}) {
  const normalized = sanitizePromptInput(value)
  if (!normalized) {
    if (required) throw new HttpsError('invalid-argument', `${fieldName} is required.`)
    return ''
  }
  if (normalized.length > MAX_PROMPT_CHARS) {
    throw new HttpsError('invalid-argument', `${fieldName} is too long.`)
  }
  return normalized
}

function parseDataUrl(dataUrl) {
  const normalized = String(dataUrl || '').trim()
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(normalized)
  if (!match) {
    throw new HttpsError('invalid-argument', 'A valid image data URL is required.')
  }
  if (normalized.length > MAX_IMAGE_DATA_URL_CHARS) {
    throw new HttpsError('invalid-argument', 'Image is too large. Try a smaller photo.')
  }
  return {
    mediaType: match[1],
    base64: match[2],
  }
}

function getRateLimitRef(uid) {
  return db.collection('aiRateLimits').doc(uid)
}

async function enforceAiRateLimit(uid, mode) {
  const now = Date.now()
  const requestCost = AI_RATE_LIMIT_COST[mode] || 1
  const ref = getRateLimitRef(uid)

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref)
    const previousWindowStartedAt = Number(snap.get('windowStartedAt')) || 0
    const previousRequestCount = Number(snap.get('requestCount')) || 0
    const windowExpired = !previousWindowStartedAt || (now - previousWindowStartedAt) >= AI_RATE_LIMIT_WINDOW_MS
    const windowStartedAt = windowExpired ? now : previousWindowStartedAt
    const requestCount = windowExpired ? requestCost : previousRequestCount + requestCost

    if (requestCount > AI_RATE_LIMIT_MAX_POINTS) {
      const retryAfterMs = Math.max(AI_RATE_LIMIT_WINDOW_MS - (now - windowStartedAt), 1000)
      const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterMs / 60000))
      throw new HttpsError(
        'resource-exhausted',
        `AI rate limit reached. Try again in ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? '' : 's'}.`
      )
    }

    transaction.set(ref, {
      windowStartedAt,
      requestCount,
      lastMode: mode,
      lastRequestAt: now,
      updatedAt: new Date(now),
    }, { merge: true })
  })
}

async function parseProviderResponse(response) {
  const data = await response.json()
  if (!response.ok) {
    const message = data?.error?.message || data?.error?.type || 'AI request failed.'
    throw new Error(message)
  }
  if (data?.error) {
    throw new Error(data.error.message || 'AI request failed.')
  }
  return data
}

function normalizeProviderErrorMessage(message) {
  const normalized = String(message || '').trim()
  if (!normalized) return 'AI request failed.'

  if (/invalid x-api-key/i.test(normalized) || /authentication_error/i.test(normalized)) {
    return 'AI is temporarily unavailable because the server Anthropic key is invalid. Update the Firebase Functions secret and try again.'
  }

  if (/rate limit/i.test(normalized)) {
    return 'AI is temporarily rate-limited. Please try again in a minute.'
  }

  return normalized
}

async function callAnthropicText({ apiKey, prompt, systemPrompt, maxTokens }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt || undefined,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await parseProviderResponse(response)
  return data.content?.[0]?.text || 'No response received.'
}

async function callAnthropicImage({ apiKey, prompt, dataUrl, maxTokens }) {
  const { mediaType, base64 } = parseDataUrl(dataUrl)
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  })

  const data = await parseProviderResponse(response)
  return data.content?.[0]?.text || 'No response received.'
}

export const aiProxy = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    cors: true,
    timeoutSeconds: 60,
    memory: '512MiB',
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in to use AI features.')
    }

    const mode = request.data?.mode
    const prompt = ensureShortString(request.data?.prompt, 'Prompt')
    const systemPrompt = ensureShortString(request.data?.systemPrompt, 'System prompt', { required: false })
    const maxTokens = clampMaxTokens(request.data?.maxTokens)
    const dataUrl = typeof request.data?.dataUrl === 'string' ? request.data.dataUrl : ''

    if (!['text', 'image'].includes(mode)) {
      throw new HttpsError('invalid-argument', 'Unsupported AI request mode.')
    }

    const anthropicApiKey = getSecretValue(ANTHROPIC_API_KEY)

    if (!anthropicApiKey) {
      throw new HttpsError(
        'failed-precondition',
        'AI is not configured on the server yet. Add the Anthropic Firebase Functions secret.'
      )
    }

    try {
      await enforceAiRateLimit(request.auth.uid, mode)
      const text = mode === 'image'
        ? await callAnthropicImage({ apiKey: anthropicApiKey, prompt, dataUrl, maxTokens })
        : await callAnthropicText({ apiKey: anthropicApiKey, prompt, systemPrompt, maxTokens })

      return {
        text,
        provider: 'anthropic',
      }
    } catch (error) {
      if (error instanceof HttpsError) {
        if (error.code === 'resource-exhausted') {
          logger.warn('AI proxy rate limit exceeded', {
            uid: request.auth.uid,
            mode,
          })
        }
        throw error
      }
      const friendlyMessage = normalizeProviderErrorMessage(error?.message)
      logger.error('AI proxy request failed', {
        uid: request.auth.uid,
        mode,
        error: friendlyMessage,
        providerError: error?.message || String(error),
      })
      throw new HttpsError('internal', friendlyMessage)
    }
  }
)
