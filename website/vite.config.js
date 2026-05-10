import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const OVERRIDES_FILE = path.resolve(__dirname, '../scripts/overrides.json')
const ROOT_DIR       = path.resolve(__dirname, '..')
const WEBSITE_DIR    = __dirname

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
              } else if (action === 'sold') {
                overrides[key] = 'sold'
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

      // Deploy endpoint — runs pipeline then npm run deploy, streams output via SSE
      server.middlewares.use('/api/admin/deploy', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end()
          return
        }

        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('Access-Control-Allow-Origin', '*')

        const send = (type, text) =>
          res.write(`data: ${JSON.stringify({ type, text })}\n\n`)

        const runStep = (label, cmd, args, cwd) =>
          new Promise((resolve, reject) => {
            send('step', label)
            const proc = spawn(cmd, args, { cwd })
            const onData = (d) =>
              d.toString().split('\n').filter(Boolean).forEach(l => send('log', l))
            proc.stdout.on('data', onData)
            proc.stderr.on('data', onData)
            proc.on('close', code =>
              code === 0 ? resolve() : reject(new Error(`${label} exited with code ${code}`))
            )
          })

        ;(async () => {
          try {
            await runStep('Running pipeline…', `${ROOT_DIR}/.venv/bin/python`,
              ['scripts/build_json.py'], ROOT_DIR)

            await runStep('Staging changes…', 'git',
              ['add', 'scripts/overrides.json', 'website/public/books.json'], ROOT_DIR)

            // Only commit if there are staged changes
            const hasStagedChanges = await new Promise(resolve => {
              const p = spawn('git', ['diff', '--cached', '--quiet'], { cwd: ROOT_DIR })
              p.on('close', code => resolve(code !== 0))
            })

            if (hasStagedChanges) {
              await runStep('Committing…', 'git',
                ['commit', '-m', 'Update books and overrides'], ROOT_DIR)
              await runStep('Pushing to main…', 'git', ['push'], ROOT_DIR)
              send('done', 'Done! Changes pushed to main.')
            } else {
              send('done', 'Pipeline ran — no changes to push.')
            }
          } catch (e) {
            send('error', e.message)
          } finally {
            res.end()
          }
        })()
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
