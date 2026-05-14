import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { inferModelCapabilitiesFromFileName } from '#features/llama-runtime/lib/inferModelCapabilities'
import { resolveLlmServerBaseUrl, LM_STUDIO_DEFAULT_BASE_URL, resolveLmStudioFetchBase } from '#features/llama-runtime/lib/resolveLlmServerBaseUrl'
import {
  chatCompletion,
  listOpenAiCompatibleModels,
  LlamaRuntimeError,
} from '#features/llama-runtime/lib/llamaRuntimeApi'

const LS_KEY = 'pdf-sources.llmRuntime.v1'

export interface LlmDiscoveredModel {
  id: string
}

interface PersistedShape {
  llmServerBaseUrl: string
  chatModelName: string
}

function loadPersisted(): Partial<PersistedShape> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<PersistedShape>
  } catch {
    return {}
  }
}

function savePersisted(p: PersistedShape) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

function pickFirstChatLikeModelId(models: LlmDiscoveredModel[]): string {
  const ids = models.map((m) => m.id)
  const nonEmbed = ids.find((id) => !/embed|embedding/i.test(id))
  return (nonEmbed ?? ids[0]) ?? ''
}

export const useLlmRuntimeStore = defineStore('llmRuntime', () => {
  const persisted = loadPersisted()

  const llmServerBaseUrl = ref(
    typeof persisted.llmServerBaseUrl === 'string' ? persisted.llmServerBaseUrl : LM_STUDIO_DEFAULT_BASE_URL,
  )
  const chatModelName = ref(persisted.chatModelName ?? '')
  const discoveredModels = ref<LlmDiscoveredModel[]>([])
  const modelsListError = ref<string | null>(null)
  const modelsListLoading = ref(false)

  const connectionStatus = ref<'idle' | 'checking' | 'ok' | 'error'>('idle')
  const lastError = ref<string | null>(null)

  const effectiveServerBase = computed(() => {
    const user = llmServerBaseUrl.value.trim().replace(/\/$/, '')
    if (!user) return resolveLlmServerBaseUrl()
    return resolveLmStudioFetchBase(user)
  })

  const displayModelLabel = computed(() => {
    if (chatModelName.value.trim()) return chatModelName.value.trim()
    return 'LM Studio — carregar modelo'
  })

  function persist() {
    savePersisted({
      llmServerBaseUrl: llmServerBaseUrl.value,
      chatModelName: chatModelName.value,
    })
  }

  watch([llmServerBaseUrl, chatModelName], persist)

  async function refreshDiscoveredModels(): Promise<void> {
    modelsListError.value = null
    modelsListLoading.value = true
    try {
      const base = effectiveServerBase.value
      if (!base) {
        discoveredModels.value = []
        modelsListError.value = 'URL base vazia (defina em Ajustes ou VITE_LLM_API_BASE no build).'
        return
      }
      const list = await listOpenAiCompatibleModels(base)
      discoveredModels.value = list
      if (list.length && !chatModelName.value.trim()) {
        chatModelName.value = pickFirstChatLikeModelId(list)
      }
    } catch (e) {
      discoveredModels.value = []
      modelsListError.value = e instanceof LlamaRuntimeError ? e.message : String(e)
    } finally {
      modelsListLoading.value = false
    }
  }

  let refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleRefreshDiscoveredModels(): void {
    if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer)
    refreshDebounceTimer = setTimeout(() => {
      refreshDebounceTimer = null
      void refreshDiscoveredModels()
    }, 350)
  }

  watch(
    () => effectiveServerBase.value,
    () => {
      scheduleRefreshDiscoveredModels()
    },
    { flush: 'post' },
  )

  async function testConnection(): Promise<boolean> {
    connectionStatus.value = 'checking'
    lastError.value = null
    try {
      let model = chatModelName.value.trim()
      if (!model || /embed|embedding/i.test(model)) {
        await refreshDiscoveredModels()
        model = chatModelName.value.trim() || pickFirstChatLikeModelId(discoveredModels.value)
      }
      if (!model) {
        connectionStatus.value = 'error'
        lastError.value =
          'Nenhum modelo de chat disponível. Prima «Detectar modelos», carregue um modelo no LM Studio e evite só embeddings na lista.'
        return false
      }
      await chatCompletion({
        baseUrl: effectiveServerBase.value,
        model,
        messages: [{ role: 'user', content: 'ping' }],
        timeoutMs: 15_000,
      })
      connectionStatus.value = 'ok'
      return true
    } catch (e) {
      connectionStatus.value = 'error'
      lastError.value = e instanceof LlamaRuntimeError ? e.message : String(e)
      return false
    }
  }

  function canRunVision(): boolean {
    const m = chatModelName.value.trim()
    if (!m) return false
    return inferModelCapabilitiesFromFileName(`${m}.gguf`).vision !== false
  }

  function setChatModelId(id: string) {
    chatModelName.value = id.trim()
  }

  function clearModelSelection() {
    chatModelName.value = ''
  }

  return {
    llmServerBaseUrl,
    chatModelName,
    discoveredModels,
    modelsListError,
    modelsListLoading,
    connectionStatus,
    lastError,
    effectiveServerBase,
    displayModelLabel,
    refreshDiscoveredModels,
    testConnection,
    canRunVision,
    setChatModelId,
    clearModelSelection,
    persist,
  }
})
