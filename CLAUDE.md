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
