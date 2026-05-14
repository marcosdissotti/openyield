import { getDocument } from 'pdfjs-dist'
import { ensurePdfWorker } from '#shared/config/pdfjs'
import type { ExtractionProgress } from '#shared/model/extractionProgress'
import { renderPdfPageToPng } from '#features/extract-pdf-rich/lib/renderPdfPageToPng'
import { chatCompletion, LlamaRuntimeError, type ChatMessage } from '#features/llama-runtime/lib/llamaRuntimeApi'
import { inferModelCapabilitiesFromFileName } from '#features/llama-runtime/lib/inferModelCapabilities'
import { selectPagesForVisionEnrich } from './selectPagesForVisionEnrich'

export interface EnrichVisionOptions {
  baseUrl?: string
  /** Nome passado ao corpo `model` do OpenAI-compatible API */
  model: string
  visionScale?: number
  timeoutMs?: number
  onProgress?: (p: ExtractionProgress) => void
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('FILE_READ_FAILED'))
    r.readAsDataURL(blob)
  })
}

function extractServerDetailFromLlamaError(err: LlamaRuntimeError): string {
  const raw = err.message
  const i = raw.indexOf('{')
  if (i >= 0) {
    try {
      const o = JSON.parse(raw.slice(i)) as { error?: { message?: string } }
      const inner = o?.error?.message
      if (inner?.trim()) return inner.trim()
    } catch {
      /* ignore */
    }
  }
  return raw.replace(/^Servidor LLM \(OpenAI\) \d+:\s*/i, '').trim() || raw
}

/** Mensagem legível no markdown (sem quebrar ênfase com underscores do servidor). */
function visionEnrichFailureNote(err: unknown): string {
  if (!(err instanceof LlamaRuntimeError)) {
    return '_Visão indisponível (rede ou erro desconhecido)._'
  }
  const detail = extractServerDetailFromLlamaError(err).replace(/`/g, "'").slice(0, 450)
  if (/mmproj|image input is not supported|multimodal|vision/i.test(detail)) {
    return (
      '_Visão indisponível._ O servidor (ex.: **LM Studio**) recusou a imagem — carregue um modelo **multimodal / VL** ' +
      'no LM Studio e confirme que o `id` em `/v1/models` corresponde ao campo modelo em Ajustes. ' +
      `Resposta: \`${detail}\``
    )
  }
  return `_Visão indisponível._ \`${detail}\``
}

interface VisionJsonPage {
  pageNum: number
  charts: unknown[]
}

function parseVisionJson(text: string): VisionJsonPage | null {
  const trimmed = text.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(trimmed.slice(start, end + 1)) as VisionJsonPage
    if (typeof obj.pageNum !== 'number' || !Array.isArray(obj.charts)) return null
    return obj
  } catch {
    return null
  }
}

/**
 * Enriquece o markdown com visão (llama-server multimodal, API OpenAI-compatible) **apenas nas páginas**
 * em que o pipeline já inferiu um **gráfico** plausível (OCR/layout — o mesmo critério do preview Chart.js).
 * Páginas só-**tabela** (layout TSV sem gráfico) não geram PNG nem chamadas ao modelo.
 */
export async function enrichMarkdownWithLlamaVision(
  file: File,
  llmMarkdown: string,
  options: EnrichVisionOptions,
): Promise<string> {
  const caps = inferModelCapabilitiesFromFileName(options.model)
  if (caps.vision === false) {
    return llmMarkdown
  }

  ensurePdfWorker()
  const data = await file.arrayBuffer()
  const pdf = await getDocument({ data }).promise
  const numPages = pdf.numPages
  const scale = options.visionScale ?? 1.35
  const startedAt = Date.now()

  const chartPages = selectPagesForVisionEnrich(llmMarkdown)
  if (chartPages.length === 0) {
    options.onProgress?.({
      phase: 'vision',
      pageCurrent: 0,
      pageTotal: 0,
      percent: 100,
      label: 'Visão omitida',
      detail: 'Nenhuma página com gráfico candidato (só tabelas ou texto); não se geraram PNG para o modelo.',
    })
    return llmMarkdown
  }

  const parts: string[] = [llmMarkdown.trimEnd(), '', '---', '', '## Enriquecimento por visão (LLM)', '']

  try {
    const totalVision = chartPages.length
    for (let i = 0; i < chartPages.length; i++) {
      const pageNum = chartPages[i]!
      if (pageNum < 1 || pageNum > numPages) continue

      const elapsedSec = (Date.now() - startedAt) / 1000
      const frac = (i + 1) / totalVision
      let etaSeconds: number | undefined
      if (frac >= 0.08 && i + 1 < totalVision) {
        etaSeconds = Math.max(1, Math.round(elapsedSec / frac - elapsedSec))
      }
      options.onProgress?.({
        phase: 'vision',
        pageCurrent: i + 1,
        pageTotal: totalVision,
        percent: Math.round(((i + 1) / totalVision) * 100),
        label: `Visão (gráfico) ${i + 1}/${totalVision}`,
        detail: `Página ${pageNum}: raster para o modelo multimodal…`,
        etaSeconds,
      })

      const page = await pdf.getPage(pageNum)
      const png = await renderPdfPageToPng(page, scale)
      const dataUrl = await blobToDataUrl(png)

      const instruction = [
        'És um assistente de análise de relatórios PDF.',
        `Página: ${pageNum} de ${numPages} (foco: gráfico já sugerido pelo pipeline OCR).`,
        'Devolve APENAS um único objeto JSON válido (sem markdown à volta) com o formato:',
        '{"pageNum": number, "charts": [{"title": string, "chartKind": "line"|"bar"|"other", "labels": string[], "datasets": [{"label": string, "data": number[]}]}]}',
        'Se não houver gráficos legíveis na imagem, usa "charts": [].',
        'Responde só com JSON.',
      ].join('\n')

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: instruction },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ]

      let reply: string
      try {
        const out = await chatCompletion({
          baseUrl: options.baseUrl,
          model: options.model,
          messages,
          timeoutMs: options.timeoutMs ?? 180_000,
          // Não usar response_format json_object: LM Studio devolve 400
          // ("type" must be json_schema or text). O prompt já exige JSON puro.
        })
        reply = out.text
      } catch (e) {
        parts.push(`### Página ${pageNum}`, '', visionEnrichFailureNote(e), '')
        continue
      }

      const parsed = parseVisionJson(reply)
      if (parsed) {
        parts.push(`### Página ${pageNum}`, '', '```json', JSON.stringify(parsed, null, 2), '```', '')
      } else {
        parts.push(`### Página ${pageNum}`, '', '```', reply.slice(0, 8000), '```', '')
      }
    }
  } finally {
    await pdf.destroy()
  }

  options.onProgress?.({
    phase: 'vision',
    pageCurrent: chartPages.length,
    pageTotal: chartPages.length,
    percent: 100,
    label: 'Visão concluída',
    detail: 'Enriquecimento por visão terminado.',
  })

  return parts.join('\n')
}
