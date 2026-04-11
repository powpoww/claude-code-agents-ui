#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const outputServer = resolve(root, '.output', 'server', 'index.mjs')

if (!existsSync(outputServer)) {
  console.log('Building agents-ui...')
  execSync('npx nuxi build', { cwd: root, stdio: 'inherit' })
}

const port = process.env.PORT || 3030
process.env.PORT = String(port)
process.env.HOST = process.env.HOST || '0.0.0.0'

console.log(`Starting agents-ui on http://localhost:${port}`)

import(outputServer)
