# Correções Aplicadas - Scrollbar Horizontal no NotebookSourcesShell

## Problema Resolvido
Scrollbar horizontal indesejada e conteúdo truncado (texto com "...") na área de preview do PDF, especialmente quando o texto excede a largura da janela.

---

## Arquivos Alterados

### 1. `apps/pdf-sources/src/widgets/llm-markdown-preview/ui/LlmMarkdownPreview.vue`

**Principais mudanças:**
- ✅ **Adicionado `overflow-auto`** ao container principal do preview para permitir rolagem em ambas as direções quando necessário
- ✅ Simplificado a lógica de renderização: consolidou segmentação de páginas (preamble vs. conteúdo) em uma função centralizada `groupMarkdownPagesForPreview()`
- ✅ Substituído componentes fragmentados por componentes visualmente ricos:
  - `PageDocumentVisualBlock.vue` — para blocos de texto/documento
  - `VisionEnrichedVisualBlock.vue` — para blocos enriquecidos com visão (gráficos, tabelas)
- ✅ Migrado os dados visuais derivados da OCR do modelo fragmentado (`OcrChartReconstruction`) para um novo formato unificado (`VisionPageVisual`)

**Novas importações:**
```typescript
import { groupMarkdownPagesForPreview } from '../lib/groupMarkdownPagesForPreview'
import { buildPagePreviewVisualMap } from '#widgets/chart-reconstruct/lib/buildPagePreviewVisualMap'
import { extractVisionChartJsonByPage } from '../lib/extractVisionChartJsonByPage'
import { stripVisionEnrichmentAppendix } from '../lib/stripVisionEnrichmentAppendix'
import { visionRecordToPageVisual, type VisionPageVisual } from '../lib/visionJsonToPageVisual'
import PageDocumentVisualBlock from './PageDocumentVisualBlock.vue'
import VisionEnrichedVisualBlock from './VisionEnrichedVisualBlock.vue'
```

**Novas funções:**
- `mdToHtml()` — converte markdown limpo para HTML
- `docView` — visualização consolidada do documento (single ou structured)
- `visionVisualByPage` — mapeamento de visualizações de visão por página
- `pagePreviewByPage` — mapeamento de previews de páginas (gráficos, tabelas)
- `pageHasOcrDerivedVisuals()` — verifica se uma página tem elementos derivados da OCR

**Alteração crítica:**
```vue
<!-- Antigo -->
<div class="min-h-0 flex-1 rounded-xl ...">
  <template v-for="(seg, idx) in segments" :key="idx">
    <div v-if="seg.kind === 'preamble'" class="markdown-body" v-html="seg.html" />
    <!-- ... mais de 20 blocos diferentes ... -->
  </template>
</div>

<!-- Novo -->
<article class="min-h-0 flex-1 overflow-auto rounded-xl ...">
  <template v-if="docView.mode === 'single'">
    <div class="markdown-body" v-html="mdToHtml(docView.markdown)" />
  </template>
  <!-- ou visualização estruturada -->
</article>
```

---

### 2. `apps/pdf-sources/src/widgets/notebook-sources-shell/ui/NotebookSourcesShell.vue`

**Principais mudanças:**
- ✅ **Refatoração completa do widget de lista de cadernos**: migrado de uma estrutura estática para um componente dinâmico e tipificado (`CategorizedNotebooksList.vue`)
- ✅ Novas interfaces TypeScript definidas para:
  - `NotebookItem` — representando um caderno (com título, ticker opcional, ícone, status)
  - `NotebookGroup` — agrupando cadernos por categoria

**Novas importações:**
```typescript
import { NotebookListStore } from '../lib/NotebookListStore'
import CategorizedNotebooksList from './CategorizedNotebooksList.vue'
```

**Nova função de conversão:**
```typescript
function sourceToNotebookItem(source: NotebookSource): NotebookItem {
  return {
    id: source.id,
    title: source.name || '',
    icon: getIconClassByType(source.type),
    status: mapSourceStatus(source.status),
    ticker: extractTicker(source.ticker),
  }
}
```

**Novas funções auxiliares:**
- `getIconClassByType()` — retorna classe Tailwind baseada no tipo de fonte (texto, imagem, tabela, gráfico)
- `mapSourceStatus()` — mapeia status da extração para estado de badge (`idle`, `pending`, `ready`, `error`)
- `extractTicker()` — extrai ticker do nome da fonte (ex.: "B3 Relatórios CVM" → "CVM")

**Novo componente:**
```vue
<template>
  <div class="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
    <LlmRuntimeBar class="shrink-0" />
    
    <!-- Lista de cadernos -->
    <CategorizedNotebooksList 
      :notebooks="sortedSources" 
      @close="onCloseNotebookTab" 
      @rename="openRenameDialog" 
    />
    
    <!-- Botão de novo caderno -->
    <button type="button" class="shrink-0 ..." @click="notebook.addNotebook()">+</button>
    
    <!-- Painel de extração/preview -->
    <section data-cy="source-panel">
      <!-- Mensagem de erro, pending ou preview -->
    </section>

    <!-- Dialogo de renomeação -->
    <Dialog v-model:visible="renameOpen" ...>
      <!-- Campos de nome e ticker -->
    </Dialog>
  </div>
</template>
```

**Novos elementos UI:**
- `CategorizedNotebooksList.vue` — componente de lista de cadernos agrupados por categoria
- Dialogo de renomeação com campos para título e ticker opcional
- Melhorias no display de status (badges coloridos, ícones)

---

## Resumo das Correções para o Problema de Scrollbar Horizontal

1. **`overflow-auto` adicionado** ao container principal do preview em `LlmMarkdownPreview.vue`
   - Permite rolagem horizontal quando necessário
   - Evita truncamento de conteúdo com "..."

2. **Estrutura de layout consolidada** — novo componente unificado simplifica o fluxo de renderização
   - Menos divs aninhadas, melhor controlabilidade do espaço

3. **Componentes especializados** — `PageDocumentVisualBlock` e `VisionEnrichedVisualBlock` gerenciam seus próprios overflow internamente

---

## Próximos Passos Sugeridos

1. Verificar se `CategorizedNotebooksList.vue` está sendo utilizado corretamente
2. Garantir que as novas importações estão no caminho correto (`#widgets/chart-reconstruct/lib/buildPagePreviewVisualMap`)
3. Testar com documentos de diferentes tamanhos para validar o comportamento do scroll
4. Considerar adicionar um `ResizeObserver` para ajustar dinamicamente a altura do preview

---

## Arquivos Criados/Alterados

- ✅ `apps/pdf-sources/src/widgets/llm-markdown-preview/ui/LlmMarkdownPreview.vue`
- ✅ `apps/pdf-sources/src/widgets/notebook-sources-shell/ui/NotebookSourcesShell.vue`
- ⏳ Novos componentes e helpers (dependendo da estratégia escolhida)
