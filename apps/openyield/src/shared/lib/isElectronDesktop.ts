export function isElectronDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.openYieldElectron?.windowMinimize
}
