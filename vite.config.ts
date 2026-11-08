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
function devServerHost(value: string | undefined): string {
  const host = value?.trim() || '127.0.0.1'
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    console.warn(`\n  ⚠ DEV_SERVER_HOST=${host}: the local server is reachable from the network, not just this computer.\n`)
  }
  return host
}

export default defineConfig(({ mode }) => {
  const lamp = mode === 'lamp'
  const env = loadEnv(mode, process.cwd(), '') // '' = also read non-VITE_ vars (never bundled)
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
    // Local dev/preview servers listen on localhost only unless DEV_SERVER_HOST says otherwise (see .env).
    server: { host: devServerHost(env.DEV_SERVER_HOST) },
    preview: { host: devServerHost(env.DEV_SERVER_HOST) },
  }
})
