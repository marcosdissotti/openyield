import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ShellAppId = 'pdf'

export const useAppShellStore = defineStore('appShell', () => {
  const activeApp = ref<ShellAppId>('pdf')
  const settingsVisible = ref(false)

  function setActiveApp(id: ShellAppId) {
    activeApp.value = id
  }

  function openSettings() {
    settingsVisible.value = true
  }

  function closeSettings() {
    settingsVisible.value = false
  }

  return { activeApp, settingsVisible, setActiveApp, openSettings, closeSettings }
})
