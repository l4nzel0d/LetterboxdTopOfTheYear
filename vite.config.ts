import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { proxyTmdb } from './api/_tmdb.js'

/**
 * Vite's dev server doesn't execute the `api/` directory, so serve the same
 * proxy here. Both paths share `proxyTmdb`, so `npm run dev` and the deployed
 * Vercel function can't drift. The key is read in the dev-server process only
 * and never reaches the browser — which is the whole reason it isn't a `VITE_`
 * variable.
 */
function devTmdbProxy(apiKey: string): Plugin {
  return {
    name: 'dev-tmdb-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/tmdb', async (req, res) => {
        // Connect strips the mount path, so req.url is just `/?path=…`.
        const params = new URLSearchParams(req.url?.split('?')[1] ?? '')
        const path = params.get('path') ?? ''
        params.delete('path')

        const { status, body } = await proxyTmdb(path, params, apiKey)
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(body))
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix: TMDB_API_KEY is deliberately unprefixed so Vite can't inline
  // it into the client bundle. `.env*` files aren't in process.env while the
  // config is evaluated, hence loadEnv.
  const { TMDB_API_KEY } = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), devTmdbProxy(TMDB_API_KEY)],
  }
})
