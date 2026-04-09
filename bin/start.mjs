#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { execSync, spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const outputDir = resolve(root, '.output')
const outputServer = resolve(outputDir, 'server', 'index.mjs')

if (!existsSync(outputServer)) {
  console.log('Building claude-code-agents-ui...')
  execSync('npm run build', { cwd: root, stdio: 'inherit' })
}

// Ensure production dependencies are installed in .output/server if node-pty is missing
const outputNodeModules = resolve(outputDir, 'server', 'node_modules', 'node-pty')
if (!existsSync(outputNodeModules)) {
  console.log('Installing production dependencies for native modules...')
  execSync('npm install --production', { cwd: resolve(outputDir, 'server'), stdio: 'inherit' })
}

const port = process.env.PORT || 3000
process.env.PORT = String(port)
process.env.HOST = process.env.HOST || '0.0.0.0'

const url = `http://localhost:${port}`
console.log(`Starting claude-code-agents-ui on ${url}`)

function openBrowser(url) {
  const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  spawn(start, [url], { detached: true }).unref()
}

// Small delay to allow server to start before opening browser
setTimeout(() => {
  openBrowser(url)
}, 2000)

import(outputServer)
