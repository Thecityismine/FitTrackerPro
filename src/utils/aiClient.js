export const AI_SETUP_MESSAGE = 'Add your Anthropic or OpenAI API key in Profile to get started.'

export function getAiCredentials(profile) {
  return {
    anthropicApiKey: profile?.anthropicApiKey?.trim() || '',
    openAiApiKey: profile?.openAiApiKey?.trim() || '',
  }
}

export function hasAiCredentials(profile) {
  const { anthropicApiKey, openAiApiKey } = getAiCredentials(profile)
  return Boolean(anthropicApiKey || openAiApiKey)
}

async function parseJsonResponse(response) {
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error?.message || 'AI request failed.')
  }
  if (data?.error) {
    throw new Error(data.error.message || 'AI request failed.')
  }
  return data
}

export async function generateAiText({ prompt, systemPrompt = '', profile, maxTokens = 500 }) {
  const { anthropicApiKey, openAiApiKey } = getAiCredentials(profile)

  if (anthropicApiKey) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system: systemPrompt || undefined,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await parseJsonResponse(response)
    return data.content?.[0]?.text || 'No response received.'
  }

  if (openAiApiKey) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: maxTokens,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
      }),
    })

    const data = await parseJsonResponse(response)
    return data.choices?.[0]?.message?.content || 'No response received.'
  }

  throw new Error(AI_SETUP_MESSAGE)
}

export async function analyzeImageWithAi({ prompt, dataUrl, profile, maxTokens = 500 }) {
  const { anthropicApiKey, openAiApiKey } = getAiCredentials(profile)

  if (anthropicApiKey) {
    const base64 = dataUrl.split(',')[1]
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    })

    const data = await parseJsonResponse(response)
    return data.content?.[0]?.text || 'No response received.'
  }

  if (openAiApiKey) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: maxTokens,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        }],
      }),
    })

    const data = await parseJsonResponse(response)
    return data.choices?.[0]?.message?.content || 'No response received.'
  }

  throw new Error(AI_SETUP_MESSAGE)
}
