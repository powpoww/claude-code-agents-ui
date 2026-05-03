#!/usr/bin/env node
// 슬러그 패턴 매칭으로 프로젝트를 personal·workspace 카테고리에 자동 할당한다.
// 이미 assignments에 슬러그가 있으면 건드리지 않는다 (사용자 수동 변경 보존).
// 카테고리가 categories[]에 시드되어 있지 않으면 해당 매칭은 건너뛰고 보고만 한다.

import { readFileSync, writeFileSync, renameSync, existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const RULES = [
  { pattern: /^-home-[^-]+-personal(-|$)/, category: 'personal' },
  { pattern: /^-home-[^-]+-workspace-/, category: 'workspace' },
]

const claudeDir = process.env.CLAUDE_DIR || join(homedir(), '.claude')
const filePath = join(claudeDir, 'project-categories.json')
const projectsDir = join(claudeDir, 'projects')

if (!existsSync(filePath)) {
  console.error(`[auto-assign] Missing ${filePath}. Run seed-project-categories.mjs first.`)
  process.exit(1)
}
if (!existsSync(projectsDir)) {
  console.error(`[auto-assign] No projects dir at ${projectsDir}.`)
  process.exit(1)
}

const data = JSON.parse(readFileSync(filePath, 'utf8'))
data.categories ??= []
data.assignments ??= {}

const seeded = new Set(data.categories.map((c) => c?.name))

const slugs = readdirSync(projectsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

const added = []
const skippedNoCategory = []
for (const slug of slugs) {
  if (Object.hasOwn(data.assignments, slug)) continue
  const rule = RULES.find((r) => r.pattern.test(slug))
  if (!rule) continue
  if (!seeded.has(rule.category)) {
    skippedNoCategory.push({ slug, category: rule.category })
    continue
  }
  data.assignments[slug] = rule.category
  added.push({ slug, category: rule.category })
}

if (added.length > 0) {
  const tmp = `${filePath}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
  renameSync(tmp, filePath)
}

console.log(`[auto-assign] Assigned: ${added.length}`)
for (const { slug, category } of added) console.log(`  ${slug} → ${category}`)
if (skippedNoCategory.length) {
  console.log(`[auto-assign] Skipped (category not seeded): ${skippedNoCategory.length}`)
  for (const { slug, category } of skippedNoCategory) console.log(`  ${slug} → ${category} (missing)`)
}
console.log(`[auto-assign] File: ${filePath}`)
