import { createWorker, type Worker } from 'tesseract.js'

let worker: Worker | null = null
let workerLang: string | null = null

export async function terminateTesseractWorker(): Promise<void> {
  if (worker) {
    await worker.terminate()
    worker = null
    workerLang = null
  }
}

export async function recognizePngWithTesseract(
  pngBlob: Blob,
  lang = 'por+eng',
  onTesseractLog?: (message: string) => void,
): Promise<string> {
  if (!worker || workerLang !== lang) {
    if (worker) await worker.terminate()
    worker = await createWorker(lang, 1, {
      logger: (m) => {
        onTesseractLog?.(m.status)
      },
    })
    workerLang = lang
  }
  const { data } = await worker.recognize(pngBlob)
  return data.text ?? ''
}
