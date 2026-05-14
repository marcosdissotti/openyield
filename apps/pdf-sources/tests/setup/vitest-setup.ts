/**
 * pdfjs-dist 4.x expects `Promise.withResolvers` (Node 22+).
 * Vitest runs in Node; keep tests working on Node 20 LTS.
 */
if (typeof Promise.withResolvers !== 'function') {
  ;(Promise as unknown as { withResolvers: <T>() => { promise: Promise<T>; resolve: (v: T | PromiseLike<T>) => void; reject: (r?: unknown) => void } }).withResolvers =
    function <T>() {
      let resolve!: (value: T | PromiseLike<T>) => void
      let reject!: (reason?: unknown) => void
      const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    }
}

import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { GlobalWorkerOptions } from 'pdfjs-dist'

const require = createRequire(import.meta.url)
const pdfPkgDir = path.dirname(require.resolve('pdfjs-dist/package.json'))
const workerPath = path.join(pdfPkgDir, 'build', 'pdf.worker.min.mjs')
GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href
