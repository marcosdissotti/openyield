/**
 * Instrução curta para VL: menos tokens de texto → o modelo foca na imagem.
 * O parser aceita envelope { pageNum, chartType, labels, datasets, ... } ou Chart.js na raiz com `type`.
 */
export function buildVisionFinancialChartInstruction(
  pageNum: number,
  numPages: number,
  opts?: { imageIsUpperPageCrop?: boolean },
): string {
  const cropNote = opts?.imageIsUpperPageCrop
    ? `\nA imagem é um **recorte da parte superior** da página (onde costuma estar o gráfico). Analisa só o que **vês** nesse recorte; não suponhas conteúdo fora dele.\n\n`
    : ''
  return (
    `Analisa **só** a imagem (raster da página ${pageNum}/${numPages} do PDF). Ignora este texto excepto regras.\n\n` +
    cropNote +
    `Regras: não inventes; ilegível → null; resposta **apenas** um objeto JSON (sem markdown, sem comentários).\n\n` +
    `Obrigatório: campo "chartType" com o que **vês** na imagem:\n` +
    `- bar | line | pie | scatter | mixed (bar+linha no mesmo gráfico)\n` +
    `- table (painel pivot / quadro só números e rótulos em grelha, sem eixos de gráfico)\n` +
    `- none (só texto corrido, mapa, foto sem dados tabulares nem gráfico)\n\n` +
    `Não uses "none" se existir grelha de indicadores ou gráfico — escolhe table ou bar/line/mixed.\n` +
    `"pageNum": ${pageNum}\n\n` +
    `Com gráfico: title, labels[] (categorias ou períodos), datasets[] com { "label", "data"[] } (números como número JSON; percentagens como string "12,3%" ou número).\n` +
    `Com tabela pivot: chartType "table", labels[] = cabeçalhos de colunas, cada dataset.label = linha/indicador, data[] = células alinhadas às colunas.\n\n` +
    `Sem conteúdo tabulável: {"pageNum":${pageNum},"chartType":"none","title":"","labels":[],"datasets":[],"options":{}}\n\n` +
    `Alternativa: raiz Chart.js com "type", "labels", "datasets" (pageNum pode omitir).`
  )
}
