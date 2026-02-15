import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Keep this for the .exe to work later
  server: {
    host: true, // 🟢 THIS FIXES THE PHONE CONNECTION
    port: 5173, // Ensures it always uses 5173
    strictPort: true, // Fails if 5173 is busy instead of switching ports
  }
})