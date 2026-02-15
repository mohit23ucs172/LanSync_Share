import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // 🟢 Fixes blank screen in .exe
  server: {
    host: '0.0.0.0', // 🟢 Forces it to look for your Hotspot/Wi-Fi IP
    port: 5173,
    strictPort: true,
  }
})