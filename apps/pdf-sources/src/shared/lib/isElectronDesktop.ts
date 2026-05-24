export function isElectronDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.pdfSourcesElectron?.windowMinimize
}
