import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true,  // 🟢 THIS IS THE KEY! It exposes the app to your Wi-Fi/Hotspot
    port: 5173,  // Keeps the port fixed
    strictPort: true,
  }
})

