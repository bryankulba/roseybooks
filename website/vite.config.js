import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

const OVERRIDES_FILE = path.resolve(__dirname, '../scripts/overrides.json')

function adminPlugin() {
  return {
    name: 'admin-overrides',
    configureServer(server) {
      // Read current overrides
      server.middlewares.use('/api/admin/override', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        if (req.method === 'GET') {
          try {
            const data = fs.existsSync(OVERRIDES_FILE)
              ? fs.readFileSync(OVERRIDES_FILE, 'utf8')
              : '{}'
            res.statusCode = 200
            res.end(data)
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: e.message }))
          }
          return
        }

        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const { key, action, volumeId } = JSON.parse(body)
              const overrides = fs.existsSync(OVERRIDES_FILE)
                ? JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'))
                : {}
              if (action === 'hide') {
                overrides[key] = 'hide'
              } else if (action === 'show') {
                delete overrides[key]
              } else if (action === 'select' && volumeId) {
                overrides[key] = { volumeId }
              } else if (action === 'confirm') {
                overrides[key] = 'confirm'
              }
              fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(overrides, null, 2) + '\n', 'utf8')
              res.statusCode = 200
              res.end(JSON.stringify({ ok: true, overrides }))
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: e.message }))
            }
          })
          return
        }

        res.statusCode = 405
        res.end(JSON.stringify({ error: 'Method not allowed' }))
      })
    },
  }
}

export default defineConfig({
  base: '/roseybooks/',
  plugins: [react(), adminPlugin()],
  css: {
    preprocessorOptions: {
      scss: {
        quietDeps: true,
      },
    },
  },
})
