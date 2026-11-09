# Procedencia de la etapa 1

La rama parte de S1-A y solo añade el expediente documental aprobado y, después, `labs/s1-d2/infrastructure/`.

| Ref | SHA | Papel |
| --- | --- | --- |
| A | `7d5b91283085871565e784c717ddc14b6736af46` | HEAD aceptado de S1-A. Padre `e332a5c142763c3a33267f4a98c2fb25ca755dec`. |
| D | `a0257480cf9c12f8ee8df71408f276f42b8ee463` | Diseño S1-B aprobado. Padre `b0dd61769a822926871aa14623ef4fd31318f5e2`. |
| M | `228d1f036643ca9be8ba85e91f8200536f3242da` | Base histórica común. `main` remoto seguía en este SHA al crear la rama. |
| Importación | `287ebd51c4446cb6be9f2d5b051b86da5577a818` | Commit documental. Solo `labs/s1-d2/s1-b-proposal/`. |
| Implementación | `6ba8cd9da7358d8315580c62ad6ec411dff19e2b` | Módulos, scripts inertes, plantilla y `offline.test.mjs`. |

El HEAD combinado es el commit que contiene este archivo. No se escribe aquí para no crear una referencia circular. Los PR #43 y #44 no se fusionan a `main`.

## Blobs que deben permanecer

Nueve archivos de S1-A, iguales en A y en esta rama:

| Path | Git blob |
| --- | --- |
| `labs/s1-d2/README.md` | `6650cea9d0f4dc205b76292f529b127107cc67d7` |
| `labs/s1-d2/guardrails/allowlist.mjs` | `5594819bddb64db22cc15b2649fad4cf9cb0cd08` |
| `labs/s1-d2/guardrails/endpoints.mjs` | `ea5fbebb16d47c64dd2385d8d16c14739e7cd2f2` |
| `labs/s1-d2/guardrails/evaluate.mjs` | `e47cd67ae6daffdd2ff8e66acc853ab9766297ae` |
| `labs/s1-d2/guardrails/fixtures.mjs` | `eaecfd86d9939a53692c1fc18e7b0fba3b7d6914` |
| `labs/s1-d2/guardrails/flags.mjs` | `16bfc5e85e3053fa2a0d34c51831e26a287ff891` |
| `labs/s1-d2/guardrails/permissions.mjs` | `1a17bd8f1d443ae86237fbc3f4a40322b6ae46f2` |
| `labs/s1-d2/guardrails/reg11a.test.mjs` | `4916092fdec193c8610afc3c05e43be996743b89` |
| `labs/s1-d2/guardrails/secrets.mjs` | `a42bd4335e549cbe2edc3118857849fd3abe3fd7` |

Nueve archivos documentales, iguales a D:

| Path | Git blob |
| --- | --- |
| `labs/s1-d2/s1-b-proposal/README.md` | `fc3a34688eb774fa7b8db3fabd81a5042a38bc65` |
| `labs/s1-d2/s1-b-proposal/adapter-contract.md` | `c875451c3f07b00db927daa30e539d397a6567c3` |
| `labs/s1-d2/s1-b-proposal/isolation-architecture.md` | `e72bdf099e46c5c9e5b6c64cfd51f6302004d436` |
| `labs/s1-d2/s1-b-proposal/manifest.json` | `90f394dbbe8fe4cf6913df9c77049564d4672c25` |
| `labs/s1-d2/s1-b-proposal/references-and-decisions.md` | `1b01aaab81da21e5eedde7816685b0875f7f2a38` |
| `labs/s1-d2/s1-b-proposal/reg11b-matrix.md` | `00cb4e622372500a66ee955e9c2884c5243ac373` |
| `labs/s1-d2/s1-b-proposal/seventh-act-proposal.md` | `de03a031c4b71b500281e404b80effe8e7432335` |
| `labs/s1-d2/s1-b-proposal/sources.json` | `3e66e5f513cf3fd9d5784f06796a6812268fd8de` |
| `labs/s1-d2/s1-b-proposal/suspension-rollback-evidence.md` | `62ef9ba2f119867ca8d46e707d30ca77f1f88dde` |

REG-11A no se volvió a ejecutar en este árbol. Su evidencia histórica sigue siendo la del SHA A. Esta suite nueva no la reemplaza.

Los hashes SHA-256 del contenido de `infrastructure/`, distintos de los blobs de git, están en [manifest.json](manifest.json).
