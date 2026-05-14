import { GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

let configured = false

export function ensurePdfWorker(): void {
  if (configured) return
  if (GlobalWorkerOptions.workerSrc) {
    configured = true
    return
  }
  GlobalWorkerOptions.workerSrc = workerUrl
  configured = true
}
