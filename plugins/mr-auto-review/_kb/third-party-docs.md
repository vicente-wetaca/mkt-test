# KB: third-party-docs

| Field | Value |
|---|---|
| concern | third-party-docs |
| last_updated | 2026-05-20 |
| corpus_size | 0 |
| methodology_version | 1 |

## Reglas duras (citas a `.claude/rules/*.md`)

*(esta categoría no se cubre con rule file estático; la fuente autoritativa es la doc OFICIAL del paquete instalado, leída en runtime vía `WebFetch`. El KB se usa para capturar mismatches recurrentes detectados durante reviews.)*

## Patrones blandos (heurísticas observadas en revisiones humanas)

*(stub — primera versión vacía. Para poblar: revisar comments históricos que digan "estás usando X que está deprecated", "esa firma cambió en v…", "esa librería ya no se mantiene", "hay un breaking change que toca esto".)*

### Heurísticas iniciales (sin corpus aún)

- **Firma copiada de internet de otra major**: ejemplos del README de v3 aplicados sobre instalación de v2 (o viceversa).
- **`@deprecated` ignorado**: la API es callable pero el typing oficial la marca como deprecated — flagging si el cambio TOCA esa API.
- **Default cambiado entre majors**: típico `addTypename: true`, `useNewUrlParser: true`, `useUnifiedTopology: true` que fueron defaults en versiones recientes y siguen pasándose explícitamente.
- **Paquete antiguo cuando hay scoped reemplazo**: `request` → `node-fetch`/`undici`; `apollo-server` → `@apollo/server`; `aws-sdk` (v2) → `@aws-sdk/*` (v3).
- **Major behind ≥2**: la versión instalada está 2+ majors detrás del last-stable y existen migration guides oficiales.
- **EOL line**: la línea de versión (ej. mongoose 5.x, node 16.x) está marcada EOL por el maintainer.
- **Active CVE**: la versión instalada tiene un advisory de seguridad público sin fix backportado.
- **Workaround documentado**: el dev hizo un workaround que la doc oficial soluciona con una API nueva (la solución mainstream existe pero no se está usando).
- **Antipattern oficial**: la doc del paquete tiene una sección explícita ("Don't do this", "Common pitfalls") y el código del MR cae en ella.

## Anti-patrones a flaggar

*(derived from patterns above; manual curation recommended)*

- Copy-paste de ejemplo de doc/blog que NO corresponde a la versión instalada.
- Configuración explícita de opciones que ya son default en la versión instalada (ruido sin valor).
- Usar `as any` o `@ts-ignore` para sortear un cambio de typing porque "la versión nueva lo arregla" — debe arreglarse, no enmascararse.
- Pinear versiones exactas (`"1.2.3"` sin `^`) sin justificación en comentario adyacente o ADR.
- Mezclar paquetes obsoletos con sus reemplazos en el mismo proyecto (ej. `request` + `node-fetch` coexistiendo).
- Eludir un campo "required" nuevo introducido por una mejora de seguridad (ej. `useTLS: true`) en versiones recientes del paquete.

## Fuentes autoritativas (orden de preferencia)

1. README oficial del paquete en el tag de la versión instalada (`https://github.com/<owner>/<repo>/tree/v<version>`).
2. Doc oficial del proyecto (campo `homepage` del `package.json`).
3. CHANGELOG.md / Releases del repo oficial.
4. GitHub Security Advisories del repo.
5. Blog posts del maintainer oficial (cuenta verificable, no terceros).
6. RFCs / proposals aceptados (cuando el proyecto los publica formalmente).

## Fuentes NO autoritativas

- Stack Overflow (puede inspirar dónde buscar, pero no es fuente para citar).
- Tutoriales de medium/dev.to no oficiales.
- Issues de GitHub con pocas reacciones (a menos que el maintainer responda confirmando).
- Tweets / threads (volátiles, no archiveable).
