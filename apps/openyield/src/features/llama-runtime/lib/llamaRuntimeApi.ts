import { resolveLlmServerBaseUrl } from './resolveLlmServerBaseUrl'
import { logger } from '#shared/lib/logger'

export interface ChatMessagePartText {
  type: 'text'
  text: string
}

export interface ChatMessagePartImageUrl {
  type: 'image_url'
  image_url: { url: string }
}

export type ChatMessageContent = string | (ChatMessagePartText | ChatMessagePartImageUrl)[]

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: ChatMessageContent
}

export interface ChatCompletionParams {
  baseUrl?: string
  apiToken?: string
  model: string
  messages: ChatMessage[]
  /** ms */
  timeoutMs?: number
  /** OpenAI-compatible; use 0 para visão determinística (LM Studio aceita). */
  temperature?: number
  /** Só usar com APIs que aceitem OpenAI `response_format.type: json_object` (ex.: OpenAI). LM Studio rejeita (400: só json_schema ou text). */
  responseFormatJson?: boolean
  /** Recebe deltas enquanto o servidor OpenAI-compatible transmite SSE (`stream: true`). */
  onTextDelta?: (delta: string, text: string) => void
  /** Reasoning/thinking separado (ex.: `choices.delta.reasoning` no LM Studio). */
  onReasoningDelta?: (delta: string, text: string) => void
}

export interface ChatCompletionResult {
  text: string
  raw: unknown
  reasoning?: string
}

export class LlamaRuntimeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'LlamaRuntimeError'
  }
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

function authHeaders(apiToken?: string): Record<string, string> {
  const token = apiToken?.trim()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Vite/proxy ou upstream fechado costumam devolver 500/502 com corpo vazio ou HTML mínimo. */
function looksLikeConnectionOrProxyFailure(status: number, errBody: string): boolean {
  if (status === 502 || status === 503 || status === 504) return true
  const t = errBody.toLowerCase()
  if (t.includes('econnrefused') || t.includes('socket hang up') || t.includes('connect econnrefused')) {
    return true
  }
  if (status === 500 && (errBody.trim().length === 0 || t.includes('internal server error'))) return true
  if (status === 500 && t.includes('<!doctype html') && errBody.length < 800) return true
  return false
}

function lmStudioUnreachableHint(): string {
  return (
    'Nada respondeu nesse endereço (ligação recusada ou servidor parado). ' +
    'No LM Studio: Developer → Start Server e confirme a porta (ex.: 1234). ' +
    'Com npm run dev, o proxy /lm-studio usa VITE_LM_STUDIO_TARGET no .env — tem de apontar para onde o LM Studio escuta. ' +
    'Em WSL, 127.0.0.1 é o Linux; se o LM Studio corre no Windows, ponha no .env o IP do host Windows (ex.: o de /etc/resolv.conf nameserver) em VITE_LM_STUDIO_TARGET ou no campo URL da app.'
  )
}

function formatLlmHttpError(status: number, errText: string): string {
  const slice = errText.replace(/`/g, "'").slice(0, 400) || 'sem detalhe'
  let msg = `Servidor LLM ${status}: ${slice}`
  if (looksLikeConnectionOrProxyFailure(status, errText)) {
    msg = `${msg}\n\n${lmStudioUnreachableHint()}`
  }
  return msg
}

export interface OpenAiModelListEntry {
  id: string
}

/**
 * GET /v1/models — LM Studio e outros servidores OpenAI-compatible.
 */
export async function listOpenAiCompatibleModels(
  baseUrl?: string,
  apiToken?: string,
): Promise<OpenAiModelListEntry[]> {
  const base = (baseUrl ?? resolveLlmServerBaseUrl()).replace(/\/$/, '')
  logger.info('Listing OpenAI-compatible models', { baseUrl: base })
  if (!base) {
    logger.error('LLM runtime not configured')
    throw new LlamaRuntimeError(
      'Runtime LLM não configurado: defina URL em Ajustes ou `VITE_LLM_API_BASE` no build.',
    )
  }
  const url = joinUrl(base, '/v1/models')
  logger.debug('Fetching models from API', { url })
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json', ...authHeaders(apiToken) } })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    logger.error('Failed to fetch models', { status: res.status, error: errText })
    throw new LlamaRuntimeError(formatLlmHttpError(res.status, errText), res.status)
  }
  const raw = (await res.json()) as { data?: { id?: string }[] }
  const rows = raw.data ?? []
  const models = rows
    .map((r) => (typeof r.id === 'string' && r.id.trim() ? { id: r.id.trim() } : null))
    .filter((x): x is OpenAiModelListEntry => x != null)
  logger.info('Models fetched successfully', { count: models.length, models: models.map(m => m.id) })
  return models
}

/**
 * POST /v1/chat/completions.
 */
export async function chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
  const baseUrl = (params.baseUrl ?? resolveLlmServerBaseUrl()).replace(/\/$/, '')
  logger.info('Chat completion request initiated', { baseUrl, model: params.model, messageCount: params.messages.length })
  if (!baseUrl) {
    logger.error('LLM runtime not configured for chat completion')
    throw new LlamaRuntimeError(
      'Runtime LLM não configurado: defina URL em Ajustes ou use o proxy `/lm-studio` em dev (LM Studio).',
    )
  }
  const url = joinUrl(baseUrl, '/v1/chat/completions')
  const timeoutMs = params.timeoutMs ?? 120_000
  const ac = new AbortController()
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const refreshTimeout = () => {
    if (timeoutHandle) clearTimeout(timeoutHandle)
    timeoutHandle = setTimeout(() => ac.abort(), timeoutMs)
  }
  refreshTimeout()
  try {
    const body: Record<string, unknown> = {
      model: params.model || 'gpt-3.5-turbo',
      messages: params.messages,
      stream: !!params.onTextDelta,
    }
    if (typeof params.temperature === 'number' && Number.isFinite(params.temperature)) {
      body.temperature = params.temperature
    }
    if (params.responseFormatJson) {
      body.response_format = { type: 'json_object' }
    }
    const bodyStr = JSON.stringify(body)
    logger.debug('Sending chat completion request', { url, bodySize: bodyStr.length, timeoutMs })
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(params.apiToken) },
      body: bodyStr,
      signal: ac.signal,
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      logger.error('Chat completion request failed', { status: res.status, error: errText })
      throw new LlamaRuntimeError(formatLlmHttpError(res.status, errText), res.status)
    }
    if (params.onTextDelta || params.onReasoningDelta) {
      const out = await readChatCompletionStream(
        res,
        (delta, text) => {
          refreshTimeout()
          params.onTextDelta?.(delta, text)
        },
        (delta, text) => {
          refreshTimeout()
          params.onReasoningDelta?.(delta, text)
        },
        refreshTimeout,
      )
      logger.info('Chat completion stream successful', { responseLength: out.text.length, model: params.model })
      return out
    } else {
      const raw = (await res.json()) as {
        choices?: { message?: { content?: string } }[]
      }
      const text = raw.choices?.[0]?.message?.content ?? ''
      const reasoning =
        (raw as { choices?: { message?: { reasoning?: string; reasoning_content?: string } }[] }).choices?.[0]?.message
          ?.reasoning ??
        (raw as { choices?: { message?: { reasoning?: string; reasoning_content?: string } }[] }).choices?.[0]?.message
          ?.reasoning_content ??
        ''
      logger.info('Chat completion successful', { responseLength: text.length, model: params.model })
      return { text, raw, reasoning }
    }
  } catch (e) {
    if (e instanceof LlamaRuntimeError) throw e
    if (e instanceof DOMException && e.name === 'AbortError') {
      logger.error('Chat completion timeout', { timeoutMs, baseUrl })
      throw new LlamaRuntimeError(`Pedido ao servidor LLM excedeu ${timeoutMs}ms (timeout).`)
    }
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      logger.error('Chat completion network error', { baseUrl, error: msg })
      throw new LlamaRuntimeError(
        `Não foi possível ligar ao servidor LLM em ${baseUrl}. ` +
          'Se usa LM Studio em `http://127.0.0.1:1234` no browser em desenvolvimento, a app já encaminha pelo proxy `/lm-studio`; ' +
          'confirme que o Vite está a correr e que `VITE_LM_STUDIO_TARGET` aponta para o LM Studio. ' +
          'Para outro PC na rede, use o URL completo e permita CORS no LM Studio ou use a app em Electron.',
      )
    }
    logger.error('Chat completion unexpected error', { error: msg })
    throw new LlamaRuntimeError(msg)
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

function extractStreamParts(raw: unknown): { content: string; reasoning: string } {
  const obj = raw as {
    choices?: {
      delta?: {
        content?: string
        reasoning?: string
        reasoning_content?: string
      }
      message?: { content?: string; reasoning?: string; reasoning_content?: string }
      text?: string
    }[]
  }
  const choice = obj.choices?.[0]
  const delta = choice?.delta
  const reasoning = delta?.reasoning ?? delta?.reasoning_content ?? choice?.message?.reasoning ?? choice?.message?.reasoning_content ?? ''
  const content = delta?.content ?? choice?.message?.content ?? choice?.text ?? ''
  return { content, reasoning }
}

function extractTextDelta(raw: unknown): string {
  return extractStreamParts(raw).content
}

function extractReasoningDelta(raw: unknown): string {
  return extractStreamParts(raw).reasoning
}

async function readChatCompletionStream(
  res: Response,
  onTextDelta: (delta: string, text: string) => void,
  onReasoningDelta: (delta: string, text: string) => void,
  onActivity?: () => void,
): Promise<ChatCompletionResult> {
  if (!res.body) throw new LlamaRuntimeError('Servidor LLM não retornou corpo de streaming.')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const events: unknown[] = []
  let buffer = ''
  let text = ''
  let reasoning = ''

  const processFrame = (frame: string) => {
    const dataLines = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
    for (const data of dataLines) {
      if (!data || data === '[DONE]') continue
      try {
        const raw = JSON.parse(data) as unknown
        events.push(raw)
        const parts = extractStreamParts(raw)
        if (parts.reasoning) {
          reasoning += parts.reasoning
          onReasoningDelta(parts.reasoning, reasoning)
        }
        if (parts.content) {
          text += parts.content
          onTextDelta(parts.content, text)
        }
      } catch {
        logger.warn('Ignoring malformed LLM stream frame', { data: data.slice(0, 240) })
      }
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    onActivity?.()
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() ?? ''
    for (const frame of frames) processFrame(frame)
  }

  buffer += decoder.decode()
  if (buffer.trim()) processFrame(buffer)
  return { text, raw: { stream: true, events }, reasoning }
}
