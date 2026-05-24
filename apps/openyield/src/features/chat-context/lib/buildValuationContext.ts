import { useNotebookStore } from '#entities/notebook'
import { useFcdSnapshotStore } from '#entities/fcd-snapshot'
import { useGrahamSnapshotStore } from '#entities/graham-snapshot/model/grahamSnapshotStore'
import { useGrahamNumberSnapshotStore } from '#entities/graham-number-snapshot/model/grahamNumberSnapshotStore'
import { computeFcdModel } from '#features/fcd-calc/lib/computeFcdModel'
import { computeGrahamModel, grahamStatusLabel } from '#features/graham-calc/lib/computeGrahamModel'
import { computeGrahamNumberModel } from '#features/graham-calc/lib/computeGrahamNumberModel'
import { formatFairPrice, formatFcdPercentFromDecimal } from '#features/fcd-calc/lib/formatFcdNumber'

export interface NotebookValuationSummary {
  notebookId: string
  title: string
  ticker: string
  isActive: boolean
  fcd?: {
    fairPricePerShare: number | null
    enterpriseValue: number | null
    wacc: number | null
    currentPrice: number | null
  }
  graham?: {
    intrinsicValue: number | null
    upside: number | null
    status: string
    currentPrice: number | null
  }
  grahamNumber?: {
    fairPrice: number | null
    upside: number | null
    status: string
    currentPrice: number | null
  }
}

function formatUpside(upside: number | null | undefined): string {
  if (upside == null || !Number.isFinite(upside)) return '—'
  const sign = upside >= 0 ? '+' : ''
  return `${sign}${upside.toFixed(1)}%`
}

function normalizeTicker(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase()
}

function summarizeNotebookValuations(activeNotebookId: string | null | undefined): NotebookValuationSummary[] {
  const notebookStore = useNotebookStore()
  const fcdStore = useFcdSnapshotStore()
  const grahamStore = useGrahamSnapshotStore()
  const grahamNumberStore = useGrahamNumberSnapshotStore()
  const summaries: NotebookValuationSummary[] = []

  for (const nb of notebookStore.notebooks) {
    const ticker = normalizeTicker(nb.ticker) || normalizeTicker(fcdStore.inputsForNotebook(nb.id, nb.ticker).ticker)
    const summary: NotebookValuationSummary = {
      notebookId: nb.id,
      title: nb.title,
      ticker: ticker || '—',
      isActive: nb.id === activeNotebookId,
    }

    if (fcdStore.byNotebookId[nb.id]) {
      const state = fcdStore.stateForNotebook(nb.id, nb.ticker)
      const model = computeFcdModel(state.inputs, state.formulaOverrides)
      const fairPrice = model.values.fairPricePerShare?.value ?? null
      const enterpriseValue = model.values.enterpriseValue?.value ?? null
      const wacc = model.values.wacc?.value ?? null
      if (Number.isFinite(fairPrice) && fairPrice! > 0) {
        summary.fcd = {
          fairPricePerShare: fairPrice,
          enterpriseValue: Number.isFinite(enterpriseValue!) ? enterpriseValue : null,
          wacc: Number.isFinite(wacc!) ? wacc : null,
          currentPrice: null,
        }
      }
    }

    if (grahamStore.byNotebookId[nb.id]) {
      const inputs = grahamStore.inputsForNotebook(nb.id, nb.ticker)
      const model = computeGrahamModel(inputs)
      if (model.intrinsicValue != null && Number.isFinite(model.intrinsicValue)) {
        summary.graham = {
          intrinsicValue: model.intrinsicValue,
          upside: model.upside,
          status: grahamStatusLabel(model.status),
          currentPrice: inputs.currentPrice > 0 ? inputs.currentPrice : null,
        }
      }
    }

    if (grahamNumberStore.byNotebookId[nb.id]) {
      const inputs = grahamNumberStore.inputsForNotebook(nb.id, nb.ticker)
      const model = computeGrahamNumberModel(inputs)
      if (model.fairPrice != null && Number.isFinite(model.fairPrice)) {
        summary.grahamNumber = {
          fairPrice: model.fairPrice,
          upside: model.upside,
          status: grahamStatusLabel(model.status),
          currentPrice: inputs.currentPrice > 0 ? inputs.currentPrice : null,
        }
      }
    }

    if (summary.fcd || summary.graham || summary.grahamNumber) {
      summaries.push(summary)
    }
  }

  return summaries
}

export function hasAnyValuationContext(): boolean {
  return summarizeNotebookValuations(useNotebookStore().activeNotebookId).length > 0
}

function formatSummaryBlock(summary: NotebookValuationSummary): string {
  const lines: string[] = [
    `- Caderno: ${summary.title}${summary.isActive ? ' (ativo)' : ''} | ticker: ${summary.ticker}`,
  ]
  if (summary.fcd) {
    lines.push(
      `  FCD: preço justo ${formatFairPrice(summary.fcd.fairPricePerShare!)}` +
        (summary.fcd.wacc != null ? ` | WACC ${formatFcdPercentFromDecimal(summary.fcd.wacc)}` : '') +
        (summary.fcd.enterpriseValue != null
          ? ` | valor da firma ${formatFairPrice(summary.fcd.enterpriseValue)}`
          : ''),
    )
  }
  if (summary.graham) {
    lines.push(
      `  Graham (LPA+crescimento): valor intrínseco ${formatFairPrice(summary.graham.intrinsicValue!)}` +
        (summary.graham.currentPrice ? ` | cotação ${formatFairPrice(summary.graham.currentPrice)}` : '') +
        ` | upside ${formatUpside(summary.graham.upside)} | ${summary.graham.status}`,
    )
  }
  if (summary.grahamNumber) {
    lines.push(
      `  Graham Number (LPA+VPA): preço justo ${formatFairPrice(summary.grahamNumber.fairPrice!)}` +
        (summary.grahamNumber.currentPrice ? ` | cotação ${formatFairPrice(summary.grahamNumber.currentPrice)}` : '') +
        ` | upside ${formatUpside(summary.grahamNumber.upside)} | ${summary.grahamNumber.status}`,
    )
  }
  return lines.join('\n')
}

export function buildValuationContext(activeNotebookId?: string | null): string {
  const summaries = summarizeNotebookValuations(activeNotebookId ?? useNotebookStore().activeNotebookId)
  if (!summaries.length) {
    return 'Nenhuma valuation calculada (FCD, Graham ou Graham Number) em cadernos deste workspace.'
  }

  const comparisonTable: string[] = []
  const fcdRows = summaries.filter((row) => row.fcd)
  if (fcdRows.length > 1) {
    comparisonTable.push(
      'Tabela comparativa FCD:',
      ...fcdRows.map(
        (row) =>
          `| ${row.ticker} | ${formatFairPrice(row.fcd!.fairPricePerShare!)} | WACC ${row.fcd!.wacc != null ? formatFcdPercentFromDecimal(row.fcd!.wacc) : '—'} |`,
      ),
    )
  }
  const grahamNumberRows = summaries.filter((row) => row.grahamNumber)
  if (grahamNumberRows.length > 1) {
    comparisonTable.push(
      'Tabela comparativa Graham Number:',
      ...grahamNumberRows.map(
        (row) =>
          `| ${row.ticker} | ${formatFairPrice(row.grahamNumber!.fairPrice!)} | upside ${formatUpside(row.grahamNumber!.upside)} | ${row.grahamNumber!.status} |`,
      ),
    )
  }

  return [
    `Valuations calculadas (${summaries.length} caderno(s)):`,
    ...summaries.map(formatSummaryBlock),
    comparisonTable.length ? '' : null,
    comparisonTable.length ? comparisonTable.join('\n') : null,
    '',
    'Use estes valores para comparar tickers entre cadernos. Cite o método (FCD, Graham, Graham Number) e o ticker.',
  ]
    .filter((line) => line != null)
    .join('\n')
}

function normalizeQuestion(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function findSummariesByQuestion(question: string, summaries: NotebookValuationSummary[]): NotebookValuationSummary[] {
  const q = normalizeQuestion(question)
  const matched = summaries.filter((row) => {
    const ticker = normalizeQuestion(row.ticker)
    const title = normalizeQuestion(row.title)
    return (ticker.length >= 3 && q.includes(ticker)) || (title.length >= 3 && q.includes(title))
  })
  return matched.length ? matched : summaries
}

export function answerFromValuations(question: string, activeNotebookId?: string | null): string | null {
  const summaries = summarizeNotebookValuations(activeNotebookId ?? useNotebookStore().activeNotebookId)
  if (!summaries.length) return null

  const q = normalizeQuestion(question)
  const asksValuation =
    /preco justo|preço justo|fair price|valuation|valuations|fcd|graham|intrinseco|intrínseco|upside|descontad|dcf|valor justo|graham number/i.test(
      question,
    )
  const asksCompare = /\bcompar|versus| vs\.? |entre\s+.+\s+e\s+/i.test(q)
  if (!asksValuation && !asksCompare) return null

  const targets = asksCompare ? findSummariesByQuestion(question, summaries) : summaries
  if (targets.length === 1 && !asksValuation) return null

  const blocks = targets.map(formatSummaryBlock)
  if (blocks.length === 1) {
    const row = targets[0]!
    const parts: string[] = [`Valuations de **${row.ticker}** (${row.title}):`]
    if (row.fcd) parts.push(`- **FCD:** ${formatFairPrice(row.fcd.fairPricePerShare!)}`)
    if (row.graham) {
      parts.push(
        `- **Graham (LPA+crescimento):** ${formatFairPrice(row.graham.intrinsicValue!)} (upside ${formatUpside(row.graham.upside)}, ${row.graham.status})`,
      )
    }
    if (row.grahamNumber) {
      parts.push(
        `- **Graham Number:** ${formatFairPrice(row.grahamNumber.fairPrice!)} (upside ${formatUpside(row.grahamNumber.upside)}, ${row.grahamNumber.status})`,
      )
    }
    return parts.join('\n')
  }

  return [
    `Comparativo de valuations (${targets.length} caderno(s)):`,
    ...blocks,
    '',
    'Valores calculados com os inputs salvos em cada caderno. Para detalhes de premissas, abra Valuation no caderno correspondente.',
  ].join('\n')
}
