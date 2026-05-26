import type { Concern } from './classifier.ts'
import type { Pattern } from './aggregator.ts'

export interface GenerateConcernMDInput {
  concern: Concern
  corpusSize: number
  lastUpdated: string
  methodologyVersion: number
  patterns: Array<Pattern>
  ruleCitations: Array<string>
}

export function generateConcernMD(input: GenerateConcernMDInput): string {
  const lines: Array<string> = []
  lines.push(`# KB: ${input.concern}`)
  lines.push('')
  lines.push('| Field | Value |')
  lines.push('|---|---|')
  lines.push(`| concern | ${input.concern} |`)
  lines.push(`| last_updated | ${input.lastUpdated} |`)
  lines.push(`| corpus_size | ${input.corpusSize} |`)
  lines.push(`| methodology_version | ${input.methodologyVersion} |`)
  lines.push('')

  lines.push('## Reglas duras (citas a `.claude/rules/*.md`)')
  lines.push('')
  if (input.ruleCitations.length === 0) {
    lines.push('*(no project rule files cited for this concern yet)*')
  } else {
    for (const c of input.ruleCitations) lines.push(`- ${c}`)
  }
  lines.push('')

  lines.push('## Patrones blandos (heurísticas observadas en revisiones humanas)')
  lines.push('')
  if (input.patterns.length === 0) {
    lines.push('*(no recurring patterns extracted yet — increase corpus size or relax threshold)*')
  } else {
    for (const p of input.patterns) {
      const iids = p.mrIids.map(i => `!${i}`).join(', ')
      lines.push(`### ${p.canonicalBody}`)
      lines.push('')
      lines.push(`- **Recurrences**: ${p.recurrences}`)
      lines.push(`- **MRs**: ${iids}`)
      if (p.examples[0]?.filePath) {
        const ex = p.examples[0]
        lines.push(`- **Example**: \`${ex.filePath}:${ex.line ?? '?'}\` (MR !${ex.iid})`)
      }
      lines.push('')
    }
  }

  lines.push('## Anti-patrones a flaggar')
  lines.push('')
  lines.push('*(derived from patterns above; manual curation recommended)*')
  lines.push('')

  lines.push('## Cómo regenerar este fichero')
  lines.push('')
  lines.push('Ver `_methodology/RUN-ANALYSIS.md`.')
  lines.push('')

  return lines.join('\n')
}
