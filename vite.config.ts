import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Modes (each loads its own env file):
//   default (.env)          lamp's own Wi-Fi, lamp at 4.3.2.1
//   --mode home (.env.home) home Wi-Fi, lamp address set in .env.home
//   --mode lamp (.env.lamp) ONE self-contained index.html for uploading to the lamp (dist-lamp/).
//     WLED 0.13 serves files from its flash filesystem, but sends .js as text/plain and
//     doesn't serve .gz automatically, so the on-lamp build must inline all JS/CSS.
export default defineConfig(({ mode }) => {
  const lamp = mode === 'lamp'
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (mode === 'home' && !env.VITE_WLED_HOST?.trim()) {
    throw new Error('Set VITE_WLED_HOST in .env.home to the lamp address on your home network (e.g. 192.168.1.106).')
  }
  return {
    base: './',
    plugins: [react(), tailwindcss(), ...(lamp ? [viteSingleFile()] : [])],
    build: {
      outDir: lamp ? 'dist-lamp' : 'dist',
      emptyOutDir: true,
      target: 'es2020',
    },
    server: { host: true },
  }
})
