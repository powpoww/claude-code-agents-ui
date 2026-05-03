#!/usr/bin/env node
// 빈 ~/.claude/project-categories.json에 초기 카테고리(personal, workspace)를 추가한다.
// 이미 같은 이름의 카테고리가 있으면 건드리지 않는다. assignments는 항상 보존한다.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const SEED_NAMES = ['personal', 'workspace']

const claudeDir = process.env.CLAUDE_DIR || join(homedir(), '.claude')
const filePath = join(claudeDir, 'project-categories.json')

let data = { categories: [], assignments: {} }
if (existsSync(filePath)) {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
    if (Array.isArray(parsed.categories)) data.categories = parsed.categories
    if (parsed.assignments && typeof parsed.assignments === 'object') data.assignments = parsed.assignments
  } catch (err) {
    console.error(`[seed] Failed to parse ${filePath}: ${err.message}`)
    process.exit(1)
  }
}

const existing = new Set(data.categories.map((c) => c?.name))
const added = []
for (const name of SEED_NAMES) {
  if (!existing.has(name)) {
    data.categories.push({ name })
    added.push(name)
  }
}

if (added.length === 0) {
  console.log(`[seed] No changes — already present: ${SEED_NAMES.join(', ')}`)
  console.log(`[seed] File: ${filePath}`)
  process.exit(0)
}

mkdirSync(dirname(filePath), { recursive: true })
const tmp = `${filePath}.tmp`
writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
renameSync(tmp, filePath)

console.log(`[seed] Added: ${added.join(', ')}`)
console.log(`[seed] File: ${filePath}`)
