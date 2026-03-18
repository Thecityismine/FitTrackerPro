import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/config'

export const AI_SERVER_MESSAGE = 'AI analysis runs securely through the app server.'
export const AI_UNAVAILABLE_MESSAGE = 'AI is not configured on the server yet. Ask the app admin to add the Firebase Functions AI secret.'

const aiProxy = httpsCallable(functions, 'aiProxy')

function getCallableErrorMessage(error) {
  if (typeof error?.details === 'string' && error.details.trim()) return error.details
  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.replace(/^internal\s*/i, '').replace(/^failed-precondition\s*/i, '').trim()
  }
  return 'AI request failed.'
}

async function callAiProxy(payload) {
  try {
    const result = await aiProxy(payload)
    return result.data?.text || 'No response received.'
  } catch (error) {
    throw new Error(getCallableErrorMessage(error))
  }
}

export async function generateAiText({ prompt, systemPrompt = '', maxTokens = 500 }) {
  return callAiProxy({
    mode: 'text',
    prompt,
    systemPrompt,
    maxTokens,
  })
}

export async function analyzeImageWithAi({ prompt, dataUrl, maxTokens = 500 }) {
  return callAiProxy({
    mode: 'image',
    prompt,
    dataUrl,
    maxTokens,
  })
}
