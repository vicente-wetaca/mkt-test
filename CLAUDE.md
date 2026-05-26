# mkt-test — reglas de proyecto

## Propósito del repo

Marketplace propio de plugins de Claude Code. Sirve como banco de pruebas para
obtener plugins existentes, personalizarlos y publicarlos.

## Reglas persistentes

### 1. Buenas prácticas oficiales de Claude Code para marketplaces

**Toda sesión que trabaje en este repo debe seguir las buenas prácticas
oficiales de Claude Code para plugin marketplaces.** Esto aplica al diseño,
nombrado, estructura, manifiestos, versionado, atribución y publicación.

Referencias canónicas (consultar antes de proponer estructura o cambios):

- Plugins overview: <https://docs.claude.com/en/docs/claude-code/plugins>
- Plugin reference (estructura `plugin.json`, skills, agents, commands, hooks):
  <https://docs.claude.com/en/docs/claude-code/plugins-reference>
- Plugin marketplaces (estructura `.claude-plugin/marketplace.json`, sources,
  versionado, instalación):
  <https://docs.claude.com/en/docs/claude-code/plugin-marketplaces>

Si una decisión entra en conflicto con esas referencias, gana la referencia.
Si la referencia no cubre el caso, dejarlo explícito antes de implementar.

### 2. Upstream tracking para plugins forkeados

Todo plugin de este marketplace que sea fork de un repo externo de GitHub
debe declarar su origen y sus customizations en
`plugins/<name>/.claude-plugin/customizations.json`, siguiendo la convención
documentada en [`docs/upstream-sync.md`](docs/upstream-sync.md).

El esquema es compatible con `forge-keeper:update-check` de dev-forge, de
forma que ese comando (u otro equivalente) pueda detectar updates upstream
y aplicarlos preservando las customizations locales.

Plugins nativos (sin upstream público) no llevan `customizations.json`, o
llevan uno con `origin.type: "native"`.
