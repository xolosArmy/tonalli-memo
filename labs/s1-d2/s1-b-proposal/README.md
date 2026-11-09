# S1-B — expediente de preparación técnica

**PROPUESTA DOCUMENTAL · S1-B NO AUTORIZADA PARA IMPLEMENTACIÓN · REG-11B NO EJECUTADA.**

Preparado el 2026-11-08 (America/Mexico_City). Este expediente propone controles y criterios verificables; no instala ni configura el laboratorio. El mandato actual permite analizar, escribir documentos y abrir un PR Draft para revisión independiente de Codex, sin merge. No permite iniciar bitcoind/Chronik, modificar firewall/puertos/servicios, ejecutar pruebas de conexión, usar llaves/fondos, modificar código productivo o desplegar. Ningún fragmento de configuración de estos documentos es una orden de ejecución.

## Índice y lectura

| Documento | Propósito |
| --- | --- |
| [Referencias y decisiones](references-and-decisions.md) | SHA exactos, análisis del PR #43, precedencia de actas, límites de evidencia y decisiones pendientes. |
| [Arquitectura](isolation-architecture.md) | Bitcoin ABC/Chronik, endpoints, controles del SO, configuración propuesta y justificaciones. |
| [Contrato de adaptadores](adapter-contract.md) | H-1/H-2 exigibles, autorización, identidad, transporte y rechazo antes de I/O. |
| [Matriz REG-11B](reg11b-matrix.md) | Casos positivos/negativos, evidencia y aceptación; todos pendientes. |
| [Suspensión y evidencias](suspension-rollback-evidence.md) | Límites operativos, parada, rollback, integridad y custodia. |
| [Séptima Acta propuesta](seventh-act-proposal.md) | Texto para evaluación; no acta adoptada ni autorización operativa. |
| [Fuentes congeladas](sources.json) | Copias de comentarios públicos de gobernanza y metadatos de fuentes primarias. |
| [Manifiesto](manifest.json) | SHA-256 y tamaño de cada archivo del expediente, salvo el propio manifiesto. |

La base documental es `228d1f036643ca9be8ba85e91f8200536f3242da`, confirmada como `main` remoto durante esta preparación. La rama se crea directamente sobre esa base, sin incorporar los PR #40–#43. El HEAD del PR documental se obtiene del propio PR y se congela en su solicitud de revisión: no se inserta en archivos de su mismo commit para evitar una referencia circular.

## Resultado de la evaluación documental

La [Sexta Acta](https://github.com/xolosArmy/tonalli-memo/pull/40#issuecomment-6709563778) cierra **S1-A offline** exclusivamente en `7d5b91283085871565e784c717ddc14b6736af46`. El PR #43 sigue Draft y sin merge. Su README es anterior al cierre: sus menciones de salida pendiente son históricas; la Sexta Acta fija el estado posterior sin que aquí se reescriba aquel archivo.

H-1 y H-2 son obligaciones pendientes para conexiones futuras. Ni el resultado `ALLOWLISTED_OFFLINE`, ni 14/14 REG-11A, ni el CI productivo verde prueban aislamiento real. La auditoría de Tepoztli se analiza según las transcripciones de las actas Quinta/Sexta: no se dispone aquí del informe original ni de sus 34 sondas para atribuirles reproducción independiente.

El diseño propone un namespace de red propio, sin enlace al host/exterior, con un broker de transporte confiable y dos listeners IPv4 exactos. El contrato elimina `connect` de la interfaz del consumidor y exige valores de seguridad completos. Su implementación, el mecanismo concreto de confinamiento y la evidencia runtime siguen pendientes de una orden separada.

## Estado preservado

| Elemento | Estado |
| --- | --- |
| S1-A | Cerrada técnicamente solo offline, en el SHA de la Sexta Acta. |
| S1-B / REG-11B | NOT AUTHORIZED; no implementada ni ejecutada por este encargo. |
| S1-C, S1-D, D2, D3, D4, mainnet | NOT AUTHORIZED. |
| RFC-0001 | PROPOSED — NOT RATIFIED. |
| S0 / S0-05 / M1.7.4 | OPEN. |
| M194-INDEXER-PERSIST | NOT_DEMONSTRATED. |
| SEC-17 | Mitigación productiva pendiente. |
| Social v2 | INACTIVE; flags OFF; permisos externos no demostrados. |
| PR #40, #41, #42, #43 y este expediente | Sin autorización de merge o despliegue. |

## Verificación realizada en esta preparación

Solo lectura de Git/archivos/fuentes documentales, comparación estática de commits, validación del diff documental, enlaces locales, JSON y hashes. No se ejecuta ninguna suite de producto ni de laboratorio. REG-11A conserva el resultado histórico atribuido; todas las filas REG-11B permanecen `NOT_RUN / NOT_AUTHORIZED`. La lectura de GitHub/documentación y la publicación del PR no constituyen sondas de conectividad a nodos.
