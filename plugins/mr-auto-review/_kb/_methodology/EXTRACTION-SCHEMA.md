# Extraction Schema (v1)

Forma de los ficheros `.dev/MR-auto-review/_research/raw/<iid>.json` que produce `extract-mr.ts`.

## Schema

```typescript
interface ExtractedMR {
  iid: number
  title: string
  author: string                      // username
  reviewers: Array<string>            // usernames (puede incluir bots; filtrar downstream)
  description: string | null
  baseSha: string
  headSha: string
  mergedAt: string | null             // ISO
  filesChanged: Array<string>
  totalLoc: number                    // suma de líneas de diff (rough)
  comments: Array<{
    noteId: number
    authorUsername: string
    body: string
    filePath: string | null           // null para non-discussion notes
    line: number | null
    resolved: boolean
    isDiscussion: boolean
    createdAt: string                 // ISO
    concern: 'code-quality' | 'tests' | 'di' | 'mongo-aggs' | 'mongo-queries' |
             'apollo-cache' | 'monorepo' | 'infra-protect' | 'gitlab-ci' |
             'event-types' | 'migrations' | 'security' | 'perf-backend' |
             'perf-frontend' | 'homogeneity' | 'solid' | 'mr-hygiene' | 'unknown'
    severity: 'must-fix' | 'should-fix' | 'nit'
    outcome: 'fixed' | 'rejected' | 'unresolved'
  }>
}
```

## Classifier heurísticas

Ver `src/classifier.ts`:

- **concern**: regex sobre body + path hint matching. Cada `CONCERN_RULES` entry tiene `patterns` (regex sobre body) y `pathHints` (regex sobre filePath). Match en cualquiera asigna el concern. Fallback a `code-quality` para prosa genérica sobre TypeScript; `unknown` si ningún rule matchea.
- **severity**: keywords. "nit", "optional", "cosmetic", "prefer" → `nit`. "bug", "broken", "security", "hardcoded", "hay que", "antes de mergear", "bloquea" → `must-fix`. Resto → `should-fix`.
- **outcome**: si `resolved` y hay diff después → `fixed`. Si `resolved` sin diff → `rejected`. Otherwise → `unresolved`.

## Limitaciones

- `followingDiff` está vacío en v1 (no se computa el diff post-comment). En v2: pasar el diff entre `created_at` del comment y `merged_at` para mejorar inferencia de `outcome`.
- Comments en español + inglés mezclados; los regex incluyen ambos idiomas pero pueden tener huecos. Revisar `_candidate-agents.md` por patrones que no encajan.
- `totalLoc` cuenta líneas del campo `diff` de cada change. Es una aproximación rough; no separa added vs removed.
