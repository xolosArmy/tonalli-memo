# S1-B etapa 1 — código inerte y pruebas offline

Octava Acta `#6744011208`. Esta carpeta no enciende Bitcoin ABC, Chronik ni RPC, no aplica namespaces ni firewall, y no ejecuta REG-11B.

Los nueve archivos de S1-A y el subárbol `labs/s1-d2/s1-b-proposal/` importado desde `a0257480cf9c12f8ee8df71408f276f42b8ee463` no se modifican aquí. El mapa de blobs está en [provenance.md](provenance.md).

## Qué hay

| Pieza | Función |
| --- | --- |
| `h1-separation.mjs` | Separa `ALLOWLISTED_OFFLINE` de un permiso de conexión. El permiso de esta etapa es `NOT_AUTHORIZED`. |
| `h2-schema.mjs` | Exige el descriptor cerrado. Un campo ausente se rechaza. No prueba que el entorno sea seguro. |
| `preflight-plan.mjs` | Comprueba un plan inerte. No mira ni cambia el host. |
| `scripts/` | Puntos de entrada que rechazan su ejecución. No están enlazados a `package.json`, hooks ni CI. |
| `templates/` | Plantilla no instalada de Bitcoin ABC 0.34.2 con Chronik. `rpcbind` no es un `bind` P2P. |
| `offline.test.mjs` | Suite nueva. No sustituye a `guardrails/reg11a.test.mjs` y no afirma su resultado. |

D-02 y D-06 siguen pendientes. Ningún módulo elige backend de namespaces ni API de broker.

## Cómo repetir solo esta suite

Desde la raíz de esta rama, sin nodo y sin instalar dependencias:

```bash
node --test labs/s1-d2/infrastructure/offline.test.mjs
```

Esa corrida no es REG-11A ni REG-11B. No abre la plantilla, no ejecuta `scripts/` y no autoriza una conexión.

## Publicación

No abrir un PR contra `main` con este árbol hasta una decisión nueva de Fernando. `.github/workflows/ci.yml`, heredado sin cambios, corre en `pull_request` hacia `main` y ejecuta `packages/chronik/test/live-sdk-integration.mjs`, que abre un listener en `127.0.0.1`. `[skip ci]` no basta para descartar esa ejecución.
