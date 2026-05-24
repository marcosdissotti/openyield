import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import App from './App.vue'
import './assets/main.css'

const app = createApp(App)
app.use(createPinia())
app.use(PrimeVue, { unstyled: true })
app.mount('#app')
