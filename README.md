# mkt-test

Marketplace personal de plugins de [Claude Code](https://docs.claude.com/en/docs/claude-code/plugins).
Sirve como banco de pruebas para forkear, personalizar y publicar plugins.

## Estado actual

Marketplace vacío (sin plugins). El catálogo vive en
[`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json).

## Añadir este marketplace en Claude Code

```bash
/plugin marketplace add vicente-wetaca/mkt-test
```

Luego, cuando haya plugins:

```bash
/plugin install <plugin-name>@mkt-test
```

## Estructura

```
mkt-test/
├── .claude-plugin/
│   └── marketplace.json     # catálogo del marketplace
├── plugins/                 # cada subdirectorio es un plugin (vacío por ahora)
├── CLAUDE.md                # reglas persistentes del proyecto
└── README.md
```

## Convenciones del repo

Las reglas que sigue cualquier sesión que trabaje aquí están en
[`CLAUDE.md`](CLAUDE.md). Resumen: se siguen las
[buenas prácticas oficiales de Claude Code para marketplaces](https://docs.claude.com/en/docs/claude-code/plugin-marketplaces).
