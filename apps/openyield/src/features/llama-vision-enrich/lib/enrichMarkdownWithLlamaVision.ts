import { getDocument } from 'pdfjs-dist'
import { ensurePdfWorker } from '#shared/config/pdfjs'
import type { ExtractionProgress } from '#shared/model/extractionProgress'
import { renderPdfPageRegionToPng, renderPdfPageToPng } from '#features/extract-pdf-rich/lib/renderPdfPageToPng'
import { chatCompletion, LlamaRuntimeError, type ChatMessage } from '#features/llama-runtime/lib/llamaRuntimeApi'
import { inferModelCapabilitiesFromFileName } from '#features/llama-runtime/lib/inferModelCapabilities'
import { selectPagesForVisionEnrich } from './selectPagesForVisionEnrich'
import { buildVisionFinancialChartInstruction } from './visionFinancialChartPrompt'
import { isVisionExtractionEmpty, parseVisionModelReply } from './visionChartJsonParse'
import { visionImageCropNormForPage } from './visionImageCropNorm'

export interface EnrichVisionOptions {
  baseUrl?: string
  apiToken?: string
  /** Nome passado ao corpo `model` do OpenAI-compatible API */
  model: string
  /** Raster PDF (72×scale). Por defeito 2.5; depois aplica-se `visionMaxLongEdgePx`. */
  visionScale?: number
  /**
   * Lado mais comprido da imagem enviada ao VL (px). Reduz VRAM; `0` = não redimensionar.
   * Por defeito 1536 (compromisso leitura de gráfico pequeno vs. memória).
   */
  visionMaxLongEdgePx?: number
  /**
   * Pausa (ms) entre um pedido de visão concluído e o seguinte — útil se o LM Studio falhar sob carga.
   * Por defeito 0.
   */
  visionCooldownMs?: number
  timeoutMs?: number
  onProgress?: (p: ExtractionProgress) => void
  /**
   * Páginas com bitmap embutido (1-based), da extração PDF.
   * Necessário para enviar gráficos **só em imagem** ao VL quando o preview não marca `chart`.
   */
  bitmapPageNumbers?: readonly number[]
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('FILE_READ_FAILED'))
    r.readAsDataURL(blob)
  })
}

/**
 * Redimensiona e envia JPEG (menor que PNG) para o VL — evita OOM em modelos 4B / GPUs modestas.
 */
async function blobToVisionDataUrl(blob: Blob, maxLongEdgePx: number): Promise<string> {
  if (maxLongEdgePx <= 0) {
    return blobToDataUrl(blob)
  }
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(blob)
  } catch {
    return blobToDataUrl(blob)
  }
  try {
    const { width: w, height: h } = bmp
    const long = Math.max(w, h)
    const scale = long > maxLongEdgePx ? maxLongEdgePx / long : 1
    const cw = Math.max(1, Math.round(w * scale))
    const ch = Math.max(1, Math.round(h * scale))
    if (scale >= 1 - 1e-6) {
      return blobToDataUrl(blob)
    }
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return blobToDataUrl(blob)
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bmp, 0, 0, cw, ch)
    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88),
    )
    if (!jpeg) {
      return blobToDataUrl(blob)
    }
    return blobToDataUrl(jpeg)
  } finally {
    bmp.close()
  }
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
  if (/crashed|memory slot|decode.*image|failed to decode|channel error|exit code/i.test(detail)) {
    return (
      '_Visão indisponível (modelo/servidor ao processar a imagem)._ Muito comum com **VRAM cheia** ou imagem **demasiado grande** ' +
      'para o VL (ex.: logs `failed to find a memory slot`, `failed to decode image`). **Sugestões:** reduzir `VITE_VISION_MAX_LONG_EDGE` (ex. 1280), ' +
      'subir offload/GPU no LM Studio, ou modelo VL com mais capacidade. ' +
      `Resposta: \`${detail}\``
    )
  }
  return `_Visão indisponível._ \`${detail}\``
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Enriquece o markdown com visão (llama-server multimodal, API OpenAI-compatible) nas páginas candidatas
 * (gráfico inferido no preview e/ou bitmap sem ser só tabela de layout). Quando a mesma página tem
 * gráfico OCR **e** tabelas de layout, envia-se ao VL um **recorte superior** da página (heurística).
 * Páginas só tabela (sem gráfico) não geram chamadas ao modelo.
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
  const pdf = await getDocument({ data: data.slice(0) }).promise
  const numPages = pdf.numPages
  const scale = options.visionScale ?? 2.5
  const visionMaxLongEdgePx = options.visionMaxLongEdgePx ?? 1536
  const visionCooldownMs = Math.max(0, options.visionCooldownMs ?? 0)
  const startedAt = Date.now()

  const chartPages = selectPagesForVisionEnrich(llmMarkdown, {
    bitmapPageNumbers: options.bitmapPageNumbers,
  })
  const bitmapPages = new Set(options.bitmapPageNumbers ?? [])
  if (chartPages.length === 0) {
    options.onProgress?.({
      phase: 'vision',
      pageCurrent: 0,
      pageTotal: 0,
      percent: 100,
      label: 'Visão omitida',
      detail:
        'Nenhuma página candidata: gráfico inferido no preview, ou bitmap **sem** classificação como tabela de layout.',
    })
    return (
      llmMarkdown.trimEnd() +
      '\n\n---\n\n## Enriquecimento por visão (LLM)\n\n' +
      '*Nenhuma página candidata ao VL.* Entram páginas com **gráfico** inferido no preview, ou com **bitmap** no PDF desde que o layout **não** seja classificado como **só tabela** (quadros financeiros em TSV não são enviados, mesmo com imagem).\n'
    )
  }

  const parts: string[] = [llmMarkdown.trimEnd(), '', '---', '', '## Enriquecimento por visão (LLM)', '']

  options.onProgress?.({
    phase: 'vision',
    pageCurrent: 0,
    pageTotal: chartPages.length,
    percent: 0,
    label: 'Visão (LLM)',
    detail: `A contactar o modelo para ${chartPages.length} página(s) com gráfico candidato…`,
  })

  try {
    const totalVision = chartPages.length
    let completed = 0

    async function oneVisionPage(pageNum: number): Promise<string> {
      if (pageNum < 1 || pageNum > numPages) return ''

      const page = await pdf.getPage(pageNum)
      const cropNorm = visionImageCropNormForPage(llmMarkdown, pageNum, {
        hasBitmap: bitmapPages.has(pageNum),
      })
      const png =
        cropNorm != null
          ? await renderPdfPageRegionToPng(page, scale, cropNorm)
          : await renderPdfPageToPng(page, scale)
      const dataUrl = await blobToVisionDataUrl(png, visionMaxLongEdgePx)

      const instruction = buildVisionFinancialChartInstruction(pageNum, numPages, {
        imageIsUpperPageCrop: cropNorm != null,
      })

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
          apiToken: options.apiToken,
          model: options.model,
          messages,
          temperature: 0,
          timeoutMs: options.timeoutMs ?? 300_000,
          // Não usar response_format json_object: LM Studio devolve 400
          // ("type" must be json_schema or text). O prompt já exige JSON puro.
        })
        reply = out.text
      } catch (e) {
        return [`### Página ${pageNum}`, '', visionEnrichFailureNote(e), ''].join('\n')
      }

      const parsed = parseVisionModelReply(reply, pageNum)
      if (parsed) {
        const lines: string[] = [`### Página ${pageNum}`, '']
        if (isVisionExtractionEmpty(parsed)) {
          lines.push(
            '*O modelo de visão não extraiu séries estruturadas nesta imagem* (`chartType: "none"` ou `datasets` vazio). ' +
              '*Pode ser falso negativo* (gráfico pequeno na página inteira, cores, modelo VL pequeno) ou a página ser sobretudo tabela/texto. ' +
              'Recorte manual do gráfico no LM Studio costuma melhorar; **modelos VL maiores** (ex. 7B+) também.',
            '',
          )
        }
        lines.push('```json', JSON.stringify(parsed.value, null, 2), '```', '')
        return lines.join('\n')
      }
      return [`### Página ${pageNum}`, '', '```', reply.slice(0, 8000), '```', ''].join('\n')
    }

    for (let i = 0; i < chartPages.length; i++) {
      const pageNum = chartPages[i]!
      const block = await oneVisionPage(pageNum)
      if (block) parts.push(block)
      completed++
      const elapsedSec = (Date.now() - startedAt) / 1000
      const frac = completed / totalVision
      let etaSeconds: number | undefined
      if (frac >= 0.08 && completed < totalVision) {
        etaSeconds = Math.max(1, Math.round(elapsedSec / frac - elapsedSec))
      }
      options.onProgress?.({
        phase: 'vision',
        pageCurrent: completed,
        pageTotal: totalVision,
        percent: Math.round((completed / totalVision) * 100),
        label: `Visão (gráfico) ${completed}/${totalVision}`,
        detail: `Página ${pageNum}: um pedido de cada vez (sequencial).`,
        etaSeconds,
      })
      if (visionCooldownMs > 0 && i + 1 < chartPages.length) {
        await sleep(visionCooldownMs)
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
