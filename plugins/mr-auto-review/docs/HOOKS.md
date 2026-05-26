# Hooks bundled — MR-auto-review

> Tercera capa del sandbox (D11): un hook `PreToolUse` que verifica que cualquier escritura (Edit/Write/NotebookEdit/Bash con redirect) queda dentro de `.dev/MR-auto-review/` mientras hay una ejecución activa de `/mr-review`. Spec: Wave 4.6 + marker-based gating.

## ¿Por qué un hook?

Las 2 primeras capas del sandbox ya cubren la mayor parte:

1. **Toolset declarado** (frontmatter del agent): los R-* tienen `disallowedTools: [Edit, Write, NotebookEdit, Bash]` (excepto R-third-party-docs que sí permite Web*). Esto impide que el subagent siquiera intente llamar esas tools.
2. **Validación server-side** (path-validator en el MCP server): toda escritura via `mr_write`/`mr_overwrite` se canonicaliza contra el workspace base. Paths con `..`, NUL bytes, o symlinks que escapen son rechazados.

El hook es la **tercera capa** — el cinturón sobre los tirantes. Su utilidad real es:

- Detectar **regresiones futuras** del toolset declarado (si por error alguien añade `Edit` a un agent).
- Defender contra **prompt-injection** donde un subagent recibe un texto malicioso que le instruye saltarse las reglas.
- Limitar el blast-radius de un **bug en el orquestador** que invoque tools mal contra el filesystem.
- Restringir incluso al **main agent** (orquestador) durante una run — los slash commands `.md` no aceptan `disallowedTools` en su frontmatter, así que el hook es el único mecanismo para limitar al orquestador.

## Marker-based gating

El hook NO restringe siempre — sólo cuando existe el marker file `.dev/MR-auto-review/_state/.active`. El orquestador `/mr-review` crea ese marker en el Paso 1.7 y lo borra en el Paso 11 (incluido en aborts). Resultado:

- **Durante un run de `/mr-review`** → el marker existe → hook activo → Edit/Write/Bash fuera del workspace se denegan.
- **Fuera de una run** → no hay marker → hook transparente → el usuario puede editar el repo normal sin trabas, incluso con el plugin cargado.

Esto significa que el hook está **registrado por defecto en `plugin.json`** (versión `0.2.0`) y se activa automáticamente. No requiere configuración manual.

### Si el orquestador crashea sin limpiar el marker

El usuario ve writes bloqueados fuera del workspace en su siguiente turno. Solución manual:

```bash
rm -f .dev/MR-auto-review/_state/.active
```

Tras eso, el hook vuelve a transparente. El marker es self-explanatory: contiene `ticketId`, `started_at`, `mode` — útil para depurar qué run lo dejó huérfano.

## Activación

### Por defecto (recomendado): cargado via plugin.json

`plugin.json` declara el hook como `PreToolUse` con `matcher: ".*"`. Cuando el plugin está cargado (vía marketplace local `wetaca-plugins`), el hook se aplica automáticamente — con marker gating, así que no estorba fuera de runs.

### Opcional: refuerzo a nivel de proyecto

Si quieres un check adicional (por ejemplo, en CI donde quieres bloquear writes ABSOLUTAMENTE incluso fuera de `/mr-review`), añade el mismo hook en `.claude/settings.json` del repo SIN marker gating:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/plugins/MR-auto-review/hooks/check-workspace-writes.py"
          }
        ]
      }
    ]
  }
}
```

Y crea el marker file de forma permanente:

```bash
mkdir -p .dev/MR-auto-review/_state
echo 'ci-permanent' > .dev/MR-auto-review/_state/.active
```

Esto deja el hook always-on. Sólo recomendado en CI dedicado.

## Lo que bloquea

Para `tool_name ∈ {Edit, Write, NotebookEdit}`:

- Inspecciona `tool_input.file_path`.
- Si NO contiene el segmento `/.dev/MR-auto-review/` (tras `realpath` para resolver symlinks) → deny con razón explícita.

Para `tool_name == Bash`:

- Detecta comandos que escriben a fichero (`>`, `>>`, `tee`, `sed -i`, `perl -i`, `awk -i inplace`, `mv`, `cp`, `dd of=`, `install`).
- Para cada destino detectado, verifica si está bajo workspace. Si NO → deny.
- Variables shell (`$VAR`) se omiten del check estático (no se puede resolver sin ejecutar — el toolset declarado debería cubrir esto).
- `/dev/null`, `/dev/stdout`, `/dev/stderr` siempre permitidos.

## Lo que NO bloquea

- Llamadas a `mr_write`/`mr_overwrite`/`mr_signal` del MCP (esas pasan por el path-validator del server).
- Reads (`Read`, `Grep`, `Glob`): el hook ignora tools no-write.
- `WebFetch`/`WebSearch`: Demetrio el Documentao (R-third-party-docs) los necesita; el hook no aplica.
- Bash commands sin redirect a fichero (`ls`, `git log`, etc.): allowed.

## Bypass

NO hay bypass declarado en el hook (a diferencia del `check-destructive.py` global del repo). La razón: si el hook necesita bypass, lo más probable es que el toolset declarado del agent esté mal configurado y haya que arreglar eso, no añadir un escape.

Si necesitas escribir fuera del workspace desde un script ad-hoc del plugin, hazlo:
- Vía `mr_write` (el server resuelve a `.dev/MR-auto-review/<ticketId>/`).
- O ejecuta el script directamente desde el shell del usuario, no desde un subagent.

## Test

`tests/hook-smoke.sh` (manual): construye payloads JSON sintéticos y verifica las decisiones. Lo ejecutas con:

```bash
bash .claude/plugins/MR-auto-review/hooks/_test/hook-smoke.sh
```

(Ver la sección Tests en `Wave 4.6` para los casos cubiertos.)

## Limitaciones conocidas

1. **El hook es heurístico para Bash**: variables shell no resueltas, here-docs complejos, y subshells anidados pueden caer en falsos positivos o falsos negativos. La defensa real es el toolset declarado del agent.
2. **El hook no inspecciona content** — solo paths. Si un subagent escribe `rm -rf /` DENTRO de un fichero del workspace, eso no se bloquea (no es escritura externa). Para detectar contenido peligroso se usa R-script-auditor (ya implementado en Wave 2).
3. **El hook no diferencia main agent vs subagent**. Si está activado, afecta TODA tool call. Por eso el opt-in.
