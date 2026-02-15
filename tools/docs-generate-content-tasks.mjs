#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

const ROOT = resolve(process.cwd())
const DOCS = resolve(ROOT, 'docs')
const SECTIONS = ['guide', 'concepts', 'compiler', 'core', 'cli', 'plugins', 'how-to']

function listMarkdown(dir) {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .filter((f) => !['index.md', 'README.md', 'readme.md'].includes(f))
      .map((f) => join(dir, f))
  } catch {
    return []
  }
}

function listAll(dir) {
  const out = []
  try {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      try {
        const st = statSync(p)
        if (st.isDirectory()) out.push(...listAll(p))
        else if (p.endsWith('.md') && !p.endsWith('/index.md') && !p.endsWith('/README.md')) out.push(p)
      } catch {}
    }
  } catch {}
  return out
}

function titleFromPath(p) {
  const base = p.split('/').pop().replace(/\.md$/, '')
  return base.replace(/^\d+[-_]?/, '').replace(/[-_]/g, ' ')
}

function main() {
  const lines = []
  lines.push('# Content Tasks')
  lines.push('')
  lines.push('Auto-generated checklist of pages to be filled out. Do not edit manually—regenerate via tools/docs-generate-content-tasks.mjs')
  lines.push('')

  for (const section of SECTIONS) {
    const dir = resolve(DOCS, section)
    const files = listAll(dir)
    if (!files.length) continue
    lines.push(`## ${section}`)
    for (const f of files) {
      const rel = relative(DOCS, f)
      const title = titleFromPath(f)
      lines.push(`- [ ] ${title} (${rel})`)
    }
    lines.push('')
  }

  const tasksDir = resolve(DOCS, 'tasks')
  mkdirSync(tasksDir, { recursive: true })
  const outPath = resolve(tasksDir, 'content-tasks.md')
  writeFileSync(outPath, lines.join('\n'))
  console.log(`Wrote ${outPath}`)
}

main()
