#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { Application } from 'typedoc'

const ROOT = resolve(process.cwd())
const PACKAGES_DIRS = [
  resolve(ROOT, 'packages'),
  resolve(ROOT, 'packages/plugins')
]

function findPackages(dir) {
  try {
    return readdirSync(dir)
      .map((name) => join(dir, name))
      .filter((p) => {
        try { return statSync(p).isDirectory() } catch { return false }
      })
  } catch { return [] }
}

function hasFile(path) {
  try { return statSync(path).isFile() } catch { return false }
}

async function analyzePackage(pkgPath) {
  const srcIndex = resolve(pkgPath, 'src/index.ts')
  if (!hasFile(srcIndex)) return null

  const app = await Application.bootstrapWithPlugins({
    entryPoints: [srcIndex],
    excludeInternal: true,
    excludePrivate: true,
    excludeProtected: true,
    skipErrorChecking: true,
  })

  const project = app.convert()
  if (!project || !project.reflections) return { name: pkgPath, total: 0, documented: 0 }

  const reflections = Object.values(project.reflections || {})
  const publicReflections = reflections.filter((r) => !r.flags?.isPrivate && !r.flags?.isProtected)

  const documented = publicReflections.filter((r) => {
    const c = r.comment
    return !!(c && (c.summary?.length || c.blockTags?.length))
  }).length

  return {
    name: pkgPath.replace(ROOT + '/', ''),
    total: publicReflections.length,
    documented
  }
}

async function main() {
  const pkgs = PACKAGES_DIRS.flatMap(findPackages)
  const results = []
  for (const p of pkgs) {
    const res = await analyzePackage(p)
    if (res) results.push(res)
  }

  let total = 0, documented = 0
  for (const r of results) {
    total += r.total
    documented += r.documented
  }
  const pct = total ? Math.round((documented / total) * 100) : 100

  console.log('TSDoc coverage report:')
  for (const r of results) {
    const pctPkg = r.total ? Math.round((r.documented / r.total) * 100) : 100
    console.log(`- ${r.name}: ${r.documented}/${r.total} (${pctPkg}%)`)
  }
  console.log(`Overall: ${documented}/${total} (${pct}%)`)

  const MIN = Number(process.env.MIN_TSDOC_COVERAGE || 40) // start lenient
  if (pct < MIN) {
    console.error(`TSDoc coverage below minimum ${MIN}%`)
    process.exit(1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
