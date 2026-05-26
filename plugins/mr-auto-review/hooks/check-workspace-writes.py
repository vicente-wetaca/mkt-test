#!/usr/bin/env python3
"""PreToolUse hook bundled with the MR-auto-review plugin (D11 — tercera capa
del sandbox). Spec: Wave 4.6 + mejora marker-based gating.

Su trabajo: durante una ejecución activa de `/mr-review`, verificar que las
tool calls de Edit/Write/NotebookEdit/Bash escriban DENTRO de
`.dev/MR-auto-review/`. Si el path apunta fuera, lo deniega. La idea es
proteger el repo del subagent R-* (o del propio main agent / orquestador) si
se salta el toolset declarado o recibe prompt-injection.

Gating por marker file: el hook SÓLO restringe cuando existe el marker
`.dev/MR-auto-review/_state/.active`. El orquestador crea el marker al inicio
de cada `/mr-review` y lo borra al final. Fuera de una run, el hook es
transparente — el usuario puede editar el repo normal sin trabas.

Si el orquestador crashea sin limpiar el marker, el usuario lo borra a mano:

    rm -f .dev/MR-auto-review/_state/.active

Input contract: JSON desde stdin con la estructura estándar de hooks de
Claude Code (`tool_name`, `tool_input.file_path` o `tool_input.command`, etc.).
Salida: JSON con `{"allow": bool, "deny_reason": str?}`.
"""

import json
import os
import re
import subprocess
import sys
from typing import Optional


# Workspace base: cualquier path bajo .dev/MR-auto-review/ se considera
# legítimo (el plugin opera ahí). El check normaliza paths para evitar
# bypass via ./ o segmentos ..
WORKSPACE_SUBSTRING = "/.dev/MR-auto-review/"

# Marker file que indica que hay una ejecución activa de /mr-review.
# Cuando NO existe, el hook es transparente (allow todo).
MARKER_RELATIVE = ".dev/MR-auto-review/_state/.active"

# Tools que se inspeccionan. El resto pasa transparente.
INSPECTED_TOOLS = {"Edit", "Write", "NotebookEdit"}
BASH_TOOL = "Bash"

# Comments only: la detección real la hace _bash_writes_outside_workspace
# directamente, escaneando tokens de redirect/tee/sed -i/etc. Mantener este
# bloque vacío clarifica que NO usamos un guard previo (todas las Bash calls
# pasan por la inspección detallada).


def is_inside_workspace(path: str) -> bool:
    """Returns True iff the absolute, realpath-normalised `path` lies under
    a `.dev/MR-auto-review/` directory anywhere in the filesystem.

    The substring check is intentional: workspace can live in any worktree
    or sandbox; the marker is the literal `.dev/MR-auto-review/` segment.
    """
    if not path:
        return False
    abs_path = os.path.abspath(path)
    try:
        real_path = os.path.realpath(abs_path)
    except OSError:
        real_path = abs_path
    # Normalize trailing slash + forward slashes
    normalized = real_path.replace(os.sep, "/")
    return WORKSPACE_SUBSTRING in normalized + "/"


def _git_repo_root() -> Optional[str]:
    """Returns the repo root via `git rev-parse --show-toplevel`, or None
    if the cwd is not inside a git repo. Cached per-process by callers.
    """
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if out.returncode == 0:
            return out.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return None


def _run_is_active() -> bool:
    """Returns True iff the marker file exists, indicating an active
    `/mr-review` run. The hook is transparent when the marker is absent.
    """
    root = _git_repo_root()
    if root is None:
        return False
    marker_path = os.path.join(root, MARKER_RELATIVE)
    return os.path.exists(marker_path)


def decide(payload: dict) -> dict:
    """Inspect the tool call payload and return an allow/deny decision."""
    # Marker-based gating: if there's no active /mr-review run, allow all.
    if not _run_is_active():
        return {"allow": True}

    tool = payload.get("tool_name") or payload.get("tool", "")
    tool_input = payload.get("tool_input", {})

    if tool in INSPECTED_TOOLS:
        file_path = tool_input.get("file_path", "")
        if file_path and not is_inside_workspace(file_path):
            return {
                "allow": False,
                "deny_reason": (
                    f"MR-auto-review hook denied {tool} on {file_path!r}: "
                    "writes must stay inside `.dev/MR-auto-review/`."
                ),
            }

    if tool == BASH_TOOL:
        command = tool_input.get("command", "")
        # Scan for redirect/tee/sed-i/etc. tokens that write to a path. If
        # any target lies outside the workspace, deny. Variables ($X) and
        # /dev/null are passed through (see helper).
        outside = _bash_writes_outside_workspace(command)
        if outside:
            return {
                "allow": False,
                "deny_reason": (
                    "MR-auto-review hook denied Bash command: writes "
                    f"to {outside!r} (outside `.dev/MR-auto-review/`). "
                    "Use mr_write/mr_overwrite via MCP instead."
                ),
            }

    return {"allow": True}


def _bash_writes_outside_workspace(command: str) -> Optional[str]:
    """Heuristic: returns the first path token that looks like a write target
    AND lies outside the workspace, or None if all write targets look safe.
    """
    # Tokens after `>`, `>>`, `tee`, `mv`, `cp`, `dd of=`, `install`
    targets: list[str] = []
    for m in re.finditer(r">{1,2}\s*(\S+)", command):
        targets.append(m.group(1))
    for m in re.finditer(r"\btee\s+(?:-a\s+)?(\S+)", command):
        targets.append(m.group(1))
    for m in re.finditer(r"\b(?:mv|cp|install)\s+\S+\s+(\S+)", command):
        targets.append(m.group(1))
    for m in re.finditer(r"\bdd\s+[^|]*of=(\S+)", command):
        targets.append(m.group(1))
    # sed/perl/awk in-place modify whatever file follows them
    for m in re.finditer(r"\bsed\s+[^|]*-i\s+(?:\S+\s+)?(\S+)", command):
        targets.append(m.group(1))
    for m in re.finditer(r"\bperl\s+[^|]*-i\s+(?:\S+\s+)?(\S+)", command):
        targets.append(m.group(1))

    for t in targets:
        # Strip quoting and shell vars; if the candidate is a non-trivial path
        # and is NOT under workspace, flag it.
        cleaned = t.strip("\"'")
        if cleaned in ("/dev/null", "/dev/stdout", "/dev/stderr"):
            continue
        if not cleaned or cleaned.startswith("$"):
            # Variable expansion — we can't statically check; skip (the
            # toolset declaration should already cover this case).
            continue
        if not is_inside_workspace(cleaned):
            return cleaned
    return None


def main() -> None:
    """Main entry: read stdin JSON, write decision JSON to stdout."""
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        # If stdin is malformed, allow by default — better than blocking the
        # session for a hook bug.
        sys.stdout.write(json.dumps({"allow": True, "warning": f"hook stdin: {exc}"}))
        return

    decision = decide(payload)
    sys.stdout.write(json.dumps(decision))


if __name__ == "__main__":
    main()
