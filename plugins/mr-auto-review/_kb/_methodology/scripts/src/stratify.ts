export type Area = 'backend' | 'frontend' | 'infra'

export interface StratifiableMR {
  iid: number
  area: Area
}

export function classifyAreaFromFiles(files: Array<string>): Area {
  let backend = 0, frontend = 0, infra = 0
  for (const f of files) {
    if (f.startsWith('frontend/')) frontend += 1
    else if (f.startsWith('infra/') || f.startsWith('.gitlab')) infra += 1
    else if (f.startsWith('services/') || f.startsWith('modules/') || f.startsWith('packages/') || f.startsWith('shared/') || f.startsWith('entities/') || f.startsWith('models/')) backend += 1
  }
  if (frontend > backend && frontend > infra) return 'frontend'
  if (infra > backend && infra > frontend) return 'infra'
  return 'backend'
}

export interface StratifyOptions {
  cap: number
  ratios: Record<Area, number>
}

export function stratifySample(pool: Array<StratifiableMR>, opts: StratifyOptions): Array<StratifiableMR> {
  const byArea: Record<Area, Array<StratifiableMR>> = { backend: [], frontend: [], infra: [] }
  for (const m of pool) byArea[m.area].push(m)

  const targets: Record<Area, number> = {
    backend: Math.floor(opts.cap * opts.ratios.backend),
    frontend: Math.floor(opts.cap * opts.ratios.frontend),
    infra: Math.floor(opts.cap * opts.ratios.infra),
  }

  const picked: Record<Area, Array<StratifiableMR>> = { backend: [], frontend: [], infra: [] }
  let shortage = 0
  for (const area of ['backend', 'frontend', 'infra'] as const) {
    const want = targets[area]
    const have = byArea[area].slice(0, want)
    picked[area] = have
    if (have.length < want) shortage += want - have.length
  }

  // Distribute shortage across areas with surplus
  for (const area of ['backend', 'frontend', 'infra'] as const) {
    if (shortage === 0) break
    const surplus = byArea[area].slice(picked[area].length)
    const take = Math.min(surplus.length, shortage)
    picked[area].push(...surplus.slice(0, take))
    shortage -= take
  }

  return [...picked.backend, ...picked.frontend, ...picked.infra]
}
