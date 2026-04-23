import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBase = env.VITE_API_BASE_URL || 'http://localhost:8081'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // Only proxy API calls — NOT browser navigation to /jobs/:id (SPA routes)
        // The proxy is only active when VITE_API_BASE_URL is not set (local dev without env)
        '/jobs': {
          target: apiBase,
          changeOrigin: true,
          secure: false,
          // Only proxy XHR/fetch requests, not browser page navigations
          bypass(req) {
            if (req.headers.accept?.includes('text/html')) {
              return '/index.html'
            }
          },
        },
        '/ssh': {
          target: apiBase,
          changeOrigin: true,
          secure: false,
        },
        '/runner': {
          target: apiBase,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  }
})
