import { initializeApp } from 'firebase-admin/app'
import { defineSecret } from 'firebase-functions/params'
import { setGlobalOptions } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'

initializeApp()
setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
})

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 1200
const MAX_PROMPT_CHARS = 30000
const MAX_IMAGE_DATA_URL_CHARS = 6_000_000

function getSecretValue(secret) {
  try {
    return secret.value() || ''
  } catch {
    return ''
  }
}

function clampMaxTokens(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 500
  return Math.max(1, Math.min(MAX_TOKENS, Math.round(parsed)))
}

function ensureShortString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `${fieldName} is required.`)
  }
  if (value.length > MAX_PROMPT_CHARS) {
    throw new HttpsError('invalid-argument', `${fieldName} is too long.`)
  }
  return value.trim()
}

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl || '')
  if (!match) {
    throw new HttpsError('invalid-argument', 'A valid image data URL is required.')
  }
  if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
    throw new HttpsError('invalid-argument', 'Image is too large. Try a smaller photo.')
  }
  return {
    mediaType: match[1],
    base64: match[2],
  }
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
    const systemPrompt = typeof request.data?.systemPrompt === 'string' ? request.data.systemPrompt : ''
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
      const text = mode === 'image'
        ? await callAnthropicImage({ apiKey: anthropicApiKey, prompt, dataUrl, maxTokens })
        : await callAnthropicText({ apiKey: anthropicApiKey, prompt, systemPrompt, maxTokens })

      return {
        text,
        provider: 'anthropic',
      }
    } catch (error) {
      logger.error('AI proxy request failed', {
        uid: request.auth.uid,
        mode,
        error: error?.message || String(error),
      })
      throw new HttpsError('internal', error?.message || 'AI request failed.')
    }
  }
)
