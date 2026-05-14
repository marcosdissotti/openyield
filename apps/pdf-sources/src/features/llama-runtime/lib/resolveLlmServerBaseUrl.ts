/**
 * Base URL da API **OpenAI-compatible** (LM Studio por defeito em `http://127.0.0.1:1234`),
 * sem barra final.
 *
 * Em dev, o proxy Vite `/lm-studio` evita CORS; o alvo real vem de `VITE_LM_STUDIO_TARGET`.
 */
export const LM_STUDIO_DEFAULT_BASE_URL = 'http://127.0.0.1:1234'

const LM_STUDIO_DEFAULT_PORT = 1234

/** Hostnames tratados como «LM Studio na mesma máquina» para uso do proxy Vite em dev. */
function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]'
}

/**
 * Em **dev no browser**, pedidos a `http://127.0.0.1:1234` (ou localhost) falham com `Failed to fetch`
 * por CORS. Se a URL for LM Studio local na porta por defeito, usa o proxy `/lm-studio` (mesma origem).
 * Outros hosts (ex. LAN) mantêm o URL directo — aí o LM Studio tem de permitir CORS ou usar Electron.
 */
export function resolveLmStudioFetchBase(userConfiguredUrl: string): string {
  const u = userConfiguredUrl.trim().replace(/\/$/, '')
  if (!u) return u
  if (!import.meta.env.DEV || typeof window === 'undefined' || !window.location?.origin) {
    return u
  }
  try {
    const parsed = new URL(u.includes('://') ? u : `http://${u}`)
    const port = parsed.port ? parseInt(parsed.port, 10) : parsed.protocol === 'https:' ? 443 : 80
    if (isLoopbackHost(parsed.hostname) && port === LM_STUDIO_DEFAULT_PORT) {
      return `${window.location.origin}/lm-studio`.replace(/\/$/, '')
    }
  } catch {
    return u
  }
  return u
}

export function resolveLlmServerBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_LLM_API_BASE as string | undefined
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.replace(/\/$/, '')
  }
  if (import.meta.env.DEV) {
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://127.0.0.1:5173'
    return `${origin}/lm-studio`.replace(/\/$/, '')
  }
  return ''
}
