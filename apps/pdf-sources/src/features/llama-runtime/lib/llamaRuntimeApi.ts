import { resolveLlmServerBaseUrl } from './resolveLlmServerBaseUrl'

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
}

export interface ChatCompletionResult {
  text: string
  raw: unknown
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
  if (!base) {
    throw new LlamaRuntimeError(
      'Runtime LLM não configurado: defina URL em Ajustes ou `VITE_LLM_API_BASE` no build.',
    )
  }
  const url = joinUrl(base, '/v1/models')
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json', ...authHeaders(apiToken) } })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new LlamaRuntimeError(formatLlmHttpError(res.status, errText), res.status)
  }
  const raw = (await res.json()) as { data?: { id?: string }[] }
  const rows = raw.data ?? []
  return rows
    .map((r) => (typeof r.id === 'string' && r.id.trim() ? { id: r.id.trim() } : null))
    .filter((x): x is OpenAiModelListEntry => x != null)
}

/**
 * POST /v1/chat/completions (sem stream).
 */
export async function chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
  const baseUrl = (params.baseUrl ?? resolveLlmServerBaseUrl()).replace(/\/$/, '')
  if (!baseUrl) {
    throw new LlamaRuntimeError(
      'Runtime LLM não configurado: defina URL em Ajustes ou use o proxy `/lm-studio` em dev (LM Studio).',
    )
  }
  const url = joinUrl(baseUrl, '/v1/chat/completions')
  const timeoutMs = params.timeoutMs ?? 120_000
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const body: Record<string, unknown> = {
      model: params.model || 'gpt-3.5-turbo',
      messages: params.messages,
      stream: false,
    }
    if (typeof params.temperature === 'number' && Number.isFinite(params.temperature)) {
      body.temperature = params.temperature
    }
    if (params.responseFormatJson) {
      body.response_format = { type: 'json_object' }
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(params.apiToken) },
      body: JSON.stringify(body),
      signal: ac.signal,
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new LlamaRuntimeError(formatLlmHttpError(res.status, errText), res.status)
    }
    const raw = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const text = raw.choices?.[0]?.message?.content ?? ''
    return { text, raw }
  } catch (e) {
    if (e instanceof LlamaRuntimeError) throw e
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new LlamaRuntimeError(`Pedido ao servidor LLM excedeu ${timeoutMs}ms (timeout).`)
    }
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      throw new LlamaRuntimeError(
        `Não foi possível ligar ao servidor LLM em ${baseUrl}. ` +
          'Se usa LM Studio em `http://127.0.0.1:1234` no browser em desenvolvimento, a app já encaminha pelo proxy `/lm-studio`; ' +
          'confirme que o Vite está a correr e que `VITE_LM_STUDIO_TARGET` aponta para o LM Studio. ' +
          'Para outro PC na rede, use o URL completo e permita CORS no LM Studio ou use a app em Electron.',
      )
    }
    throw new LlamaRuntimeError(msg)
  } finally {
    clearTimeout(t)
  }
}
