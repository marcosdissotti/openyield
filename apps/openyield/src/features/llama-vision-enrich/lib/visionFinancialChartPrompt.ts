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
    `- bar | line | area | pie | scatter | mixed (bar+linha no mesmo gráfico)\n` +
    `- table (painel pivot / quadro só números e rótulos em grelha, sem eixos de gráfico)\n` +
    `- none (só texto corrido, mapa, foto sem dados tabulares nem gráfico)\n\n` +
    `Não uses "none" se existir grelha de indicadores ou gráfico — escolhe table ou bar/line/area/mixed.\n` +
    `Se for um gráfico temporal com região **preenchida** sob a curva (área colorida por anos/períodos), usa "chartType":"area", não "line".\n` +
    `Se houver gráfico em cima e tabela em baixo, extraia o gráfico e ignore a tabela. Só use "table" quando a imagem/recorte não tiver gráfico.\n` +
    `Faixas coloridas com anos dentro (2015, 2016...) são períodos visuais; não significam uma série linear anual. Não use 2015..2026 com 20,40,60... se esses valores não estiverem escritos/visíveis.\n` +
    `Para gráficos contínuos/densos sem marcadores de cada ponto, NÃO inventes valores anuais lineares. Extraia só pontos legíveis/âncoras visuais: rótulos explícitos, início/fim de ano, picos/vales aproximados lidos no eixo Y. Use null quando não der para estimar.\n` +
    `Se existirem anotações com setas/caixas (ex.: "20%", "83,5%"), inclua-as em "annotations":[{"label","x","y"}].\n` +
    `"pageNum": ${pageNum}\n\n` +
    `Com gráfico: title, labels[] (categorias ou períodos), datasets[] com { "label", "data"[] } (números como número JSON; percentagens como string "12,3%" ou número; null se ilegível).\n` +
    `Com tabela pivot: chartType "table", labels[] = cabeçalhos de colunas, cada dataset.label = linha/indicador, data[] = células alinhadas às colunas.\n\n` +
    `Sem conteúdo tabulável: {"pageNum":${pageNum},"chartType":"none","title":"","labels":[],"datasets":[],"options":{}}\n\n` +
    `Alternativa: raiz Chart.js com "type", "labels", "datasets" (pageNum pode omitir).`
  )
}
