/// <reference types="vite/client" />

import type { HardwareSummaryPayload } from './src/shared/model/hardwareSummary'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

export interface PdfSourcesElectronApi {
  getHardwareSummary: () => Promise<HardwareSummaryPayload>
}

declare global {
  interface Window {
    pdfSourcesElectron?: PdfSourcesElectronApi
  }
}

interface ImportMetaEnv {
  readonly VITE_LLM_API_BASE?: string
  readonly VITE_LM_STUDIO_TARGET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
