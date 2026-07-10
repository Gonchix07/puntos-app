import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // accesible por IP en la red local
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
})
