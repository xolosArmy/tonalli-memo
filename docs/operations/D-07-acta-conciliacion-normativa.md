# D-07 — Acta de conciliación normativa TM1 Core v1.0

**Proyecto:** xolosArmy Network / Tonalli Memo  
**Fecha de preparación:** 2026-10-26  
**Estado:** **PROPUESTA DE ACTA — NO RATIFICADA / NO ACTIVAR CAMBIOS DE PROTOCOLO**  
**Ámbito:** TM1 Core (normas de publicación y verificación). La aprobación de este documento no autoriza publicaciones, cambios en Wallet, despliegues ni activación de REPLY.

## 1. Fuentes y jerarquía de evidencia

1. [Auditoría Técnica Protocolo TM1 Core (D-07, entregables A–F)](https://docs.google.com/document/d/1ZpVL0Bgc5dYglFq5IfmZ15YPicJ_rxFNlMTd_Db3oAo/edit) — recomendación final **READY FOR NORMATIVE REVIEW**, no aceptación definitiva.
2. [Especificación vigente de repositorio: `docs/protocol/tm1-spec.md`](../protocol/tm1-spec.md) — **Draft 0.2**, todavía no ratificada.
3. Código verificable del repositorio en base `b50991de2bbdb1b284456006ded9979a6eecd36d`: `packages/protocol/src/{parse-tm1,encode-tm1,tm1-constants}.ts`, `packages/verification/src/{candidates,verify-normalized,verify-tm1-designated-input}.ts`, sus vectores y pruebas.
4. [Vectores de autoría](../protocol/tm1-authorization-vectors.md) y documentación operativa existente. El expediente de WebSocket [M0-A-WS-01](./M0-A-WS-01-heartbeat.md) valida transporte inicial, **no** ratificación de TM1.
5. RFC-0001 Public Replies **DRAFT v0.1**, preparado el 2026-10-24: propuesta futura, no una activación ni una garantía de retrocompatibilidad.

**Distinción de autoridad:** eCash proporciona la prueba primaria de las transacciones; Chronik es un proveedor de consulta/observación; los resultados de SQLite y checkpoints son derivados. La regeneración histórica *total* no debe afirmarse sin verificar mecanismos de descubrimiento y dependencias operativas.

## 2. Resoluciones propuestas (mandato de preparación, sujetas a ratificación formal)

| ID | Estado | Propuesta y alcance |
| --- | --- | --- |
| D07-R1 — múltiples sobres | **ACEPTADO como dirección; PENDIENTE DE CONFORMIDAD en interoperabilidad y alcance de aplicación** | **TM1 Wire Protocol:** múltiples candidatos TM1 se rechazan; salidas OP_RETURN ajenas pueden coexistir. **Tonalli Memo Verifier Policy:** candidatos Tonalli combinados TM0+TM1 se rechazan actualmente como `MULTIPLE_MEMOS`. La política de aplicación no se convierte automáticamente en una regla del formato TM1. **Coexistencia TM1 + OP_RETURN ajeno: verificada por CI en PR #32**, commit squash `69e61c6e34eae7eb38e4a523f0c59fd45204d21e`; sigue pendiente delimitar cobertura de sobres malformados y formalizar el perfil de aplicación. |
| D07-R2 — autoría | **ACEPTADO** | La autoría se deriva del input especificado por el byte `author_input_index` (0–255 y dentro del rango real de inputs), **no necesariamente input 0**. El prevout seleccionado debe ser P2PKH estándar; comprobar scriptSig, hash de clave pública y política sighash, con las condiciones de confianza del verificador documentadas. |
| D07-R3 — P2SH/multifirma | **ACEPTADO (exclusión de v1.0); DIFERIDO (extensiones)** | No admitir P2SH, multisig, covenant u otros scripts como fuente de autoría TM1 Core v1.0. No se les declara inválidos para eCash; solo **no compatibles con autoría TM1 v1.0**. Una eventual extensión requiere especificación y revisión independientes. |
| D07-R4 — checkpoints/rate limiting | **ACEPTADO como política operativa, NO regla de bytes de consenso** | Backfill, reconciliación, paginación, límites de tasa, retry/backoff y checkpoints locales son mecanismos del indexador; nunca autoridad sobre datos on-chain. **No establecer backups de SQLite obligatorios** ni asumir una reconstrucción completa demostrada. |
| D07-R5 — REPLY/RFC-0001 | **ACEPTADO (reserva); DIFERIDO (activación)** | `event_type=0x02` permanece reservado y rechazado como `UNSUPPORTED_EVENT_TYPE` hasta un RFC aprobado, vectores de conformidad y despliegue coordinado. RFC-0001 no puede acceder a claves privadas ni duplicar el flujo de firma/broadcast; RMZWallet/Tonalli Wallet conserva la autorización humana y la autoridad de firma. No prometer ausencia absoluta de cambios futuros de Wallet. |
| D07-R6 — política de bytes | **ACEPTADO con precisión terminológica** | `223` bytes del script OP_RETURN completo y `212` bytes máximos de `event_data` UTF-8 son límites de **compatibilidad definidos por TM1**, no límites universales de consenso eCash; mantener push mínimo y preservación exacta de bytes. |

El lenguaje «ACEPTADO» de esta matriz representa **la propuesta de decisiones aceptadas para preparar el acta**, no una resolución final promulgada ni autorización técnica de cambio.

## 3. Conciliación: resultados observables y puntos abiertos

### 3.1 Autoría explícita — discrepancia material corregida

La auditoría D-07 describe el input 0 como obligatorio, pero la especificación Draft 0.2 señala que **los verificadores NO DEBEN suponer input 0**; es solo el valor recomendado para publicaciones ordinarias. El encoder `encodeTm1Post` acepta 0–255, y `parseTm1Output` preserva ese byte. `verifyNormalizedTransaction` llama a `verifyTm1DesignatedInput(transaction, memo.authorInputIndex)`. **Criterio de conciliación:** conservar el índice explícito. No reinterpretar publicaciones históricas.

### 3.2 Cardinalidad — frontera entre TM1 Wire Protocol y Tonalli Memo Verifier Policy

**TM1 Wire Protocol:** la [especificación Draft 0.2](../protocol/tm1-spec.md) exige exactamente un candidato TM1 por transacción y `MULTIPLE_MEMOS` cuando hay dos o más. También permite otros `OP_RETURN` ajenos a TM1. La mera existencia de un candidato TM0 no constituye otro candidato **TM1**.

**Tonalli Memo Verifier Policy (aplicación):** [`findMemoCandidates`](../../packages/verification/src/candidates.ts) combina candidatos TM0 y TM1; [`verifyNormalizedTransaction`](../../packages/verification/src/verify-normalized.ts) retorna `{status: "MULTIPLE_MEMOS", ...}` si la lista combinada contiene más de un candidato. Es un **resultado estructurado**, no una excepción y no declara inválida la transacción según el consenso eCash. La política del verificador puede ser más restrictiva para el read model sin redefinir el formato TM1 interoperable.

#### Matriz de conformidad — evidencia existente vs. pruebas pendientes

| Combinación sintética | Comportamiento actual o esperado | Sustento | Estado de evidencia |
| --- | --- | --- | --- |
| TM1 único válido, autoría verificable | `VERIFIED_TM1` | [`tm1-integration.test.ts`](../../packages/verification/test/tm1-integration.test.ts), caso `verifies one TM1 candidate through the designated input` | **Cubierto en test** |
| Dos candidatos TM1 | `MULTIPLE_MEMOS` | Vectores transaccionales inválidos y lógica de cardinalidad en `verify-normalized.ts` | **Cubierto por vectores e implementación** |
| TM1 y TM0 en outputs separados | `MULTIPLE_MEMOS`, candidatos `["TM1", "TM0"]` | [`tm1-integration.test.ts`](../../packages/verification/test/tm1-integration.test.ts), caso `fails closed when independent TM0 and TM1 candidates coexist` | **Cubierto en test explícito** |
| TM1 + OP_RETURN con marcador ajeno a TM0/TM1 | `VERIFIED_TM1` (no `MULTIPLE_MEMOS`) para TM1 válido, con output ajeno antes o después | [`tm1-integration.test.ts`](../../packages/verification/test/tm1-integration.test.ts), test parametrizado `accepts valid TM1 with an unrelated OP_RETURN`; [PR #32](https://github.com/xolosArmy/tonalli-memo/pull/32) | **Verificado por CI**, caso sintético de dos órdenes |
| Dos candidatos TM0 | `MULTIPLE_MEMOS` | [`verify-normalized.test.ts`](../../packages/verification/test/verify-normalized.test.ts), `returns coherent MULTIPLE_MEMOS for two valid candidates before protocol selection` | **Cubierto en test explícito** |
| TM1 válido + segundo candidato TM1 malformado tras reconocer LOKAD | `MULTIPLE_MEMOS` antes de interpretar el segundo sobre | `isTm1CandidateScript`, enumeración de candidatos y cardinalidad previa | **Derivado del código; ampliar cobertura específica** |

**Respaldo empírico:** `69e61c6e34eae7eb38e4a523f0c59fd45204d21e` ([PR #32](https://github.com/xolosArmy/tonalli-memo/pull/32), squash merged a `main`). Su commit previo de prueba `779cce325b848632cdd07929936551c65c2a026c` obtuvo **GitHub Actions: `success`** ([run 40347096463](https://github.com/xolosArmy/tonalli-memo/actions/runs/40347096463)). El test parametrizado utiliza un TM1 válido más `OP_RETURN 6a04deadbeef`, primero como output 0 y luego como output 1; en ambos casos comprueba `VERIFIED_TM1`, `candidate.outputIndex`, texto y autor. La prueba TM1+TM0 existente sigue comprobando `MULTIPLE_MEMOS`. **Esto demuestra el comportamiento del verificador en esos vectores sintéticos**, no garantiza por sí solo interoperabilidad histórica universal, retransmisión de nodos eCash, ni un despliegue adicional en Contabo. No se emitieron transacciones reales ni se modificó producción.

**Resolución normativa propuesta:** conservar unicidad **TM1** en la especificación del sobre; documentar separadamente el rechazo de **TM0+TM1** como política de aceptación del verificador Tonalli Memo. No imponer esta última como restricción universal a todos los consumidores TM1.

**Puerta pendiente:** **cumplida** la prueba de regresión TM1 + OP_RETURN realmente ajeno (PR #32, CI exitoso); continúan pendientes precisar la cobertura de candidatos TM1 malformados, documentar el resultado API y decidir si la política del verificador se publica como perfil de aplicación versionado antes de ratificar v1.0.

**Estado de este hallazgo:** el escenario de interoperabilidad con marcador ajeno pasa de **pendiente de prueba** a **verificado por CI**. La conciliación general D-07 y la ratificación normativa **siguen pendientes** de sus demás puertas (secciones 3.3–3.6 y 5).

### 3.3 P2PKH y firmas — modelo de confianza

La selección de input y los controles de estructura P2PKH, coincidencia de HASH160 y sighash `0x41`/`0xc1` se encuentran en `verify-tm1-designated-input.ts`. El propio módulo documenta que **no revalida criptográficamente el digest de firma por sí mismo**: depende de Chronik/nodo confiable para validez de script/transacción. La especificación distingue ese modelo de un verificador autónomo no confiable, que debe validar también la firma. No declarar «firma verificada localmente de forma independiente» sin demostrarlo.

#### D07-CONF-02 — Autoría designada y política P2PKH

**Evidencia incorporada en `main`:** [PR #34](https://github.com/xolosArmy/tonalli-memo/pull/34), Squash and Merge `a232b26ec99eaac5fac7a340baaebb04492c1b6a`. Commit del test sometido a CI y revisión manual de Codex: `206e7db2bcb6b3e52130430210d6ffeb2b6c5383`. GitHub Actions [run 40355179729](https://github.com/xolosArmy/tonalli-memo/actions/runs/40355179729): **SUCCESS**; Codex Connector: revisión completada **sin problemas importantes**.

**Suite:** [`apps/indexer/test/engine/d07-conf-02.test.ts`](https://github.com/xolosArmy/tonalli-memo/blob/main/apps/indexer/test/engine/d07-conf-02.test.ts). Cubre vía `MemoVerificationService → IndexingEngine → SQLite in-memory`:

| Escenario sintético | Resultado / evidencia |
| --- | --- |
| Índices `author_input_index` 1 y 255 fuera de rango para transacciones de una entrada | `INVALID_TM1` / `AUTHOR_INPUT_OUT_OF_RANGE` |
| Metadata del prevout designado ausente | `INVALID_TM1` / `PREVOUT_UNAVAILABLE` |
| Prevout designado P2SH o multifirma bare | `INVALID_TM1` / `UNSUPPORTED_AUTHOR_SCRIPT` |
| `scriptSig` malformado o empuje no mínimo | `INVALID_TM1` / `INVALID_AUTHOR_SCRIPT_SIG` |
| Hash de clave pública incompatible con el prevout | `INVALID_TM1` / `INVALID_AUTHOR_SIGNATURE` |
| Sighash `0x42` | `INVALID_TM1` / `UNSUPPORTED_SIGHASH` |
| Índice designado no cero (=1) y sighash `0x41` o `0xc1` | `VERIFIED_TM1`; índice y política de confianza preservados |
| Una autoría P2SH inválida seguida de otra entrada TM1 válida en diferente transacción | El resultado inválido no entra en el feed verificado; la segunda transacción se procesa |

En las variantes inválidas, la persistencia almacena estado `INVALID_MEMO`, diagnósticos explícitos y **ningún autor atribuido**. **Alcance y límite:** los fixtures son sintéticos, con firmas de prueba no criptográficamente válidas. `VERIFIED_TM1` en un mock de Chronik prueba la **política estructural bajo el modelo `trusted-chronik`**, **no** verificación local independiente de ECDSA/Schnorr, ni aceptación en consenso de transacciones fabricadas. `PREVOUT_UNAVAILABLE` representa falta de metadata en la respuesta normalizada, no prueba que un UTXO sea inexistente en la blockchain. Quedan pendientes validaciones históricas y backfill/reinicio reales. Sin cambios de producción, Wallet, protocolo ni broadcast.

### 3.4 Reglas de capacidad y push mínimo

`MAX_TM1_SCRIPT_BYTES=223`, `MAX_TM1_EVENT_DATA_BYTES=212`, `POST=0x01` y el rechazo de eventos distintos se encuentran en el parser/encoder. Los test del parser cubren valores de borde, UTF-8 estricto, pushes no mínimos y rechazo de `0x02`. Estos límites son de compatibilidad y política de aplicación; no sustituirlos por «consenso eCash».

#### D07-CONF-01 — Verificación del motor de indexación frente a TM1 malformado

**Evidencia incorporada en `main`:** [PR #33](https://github.com/xolosArmy/tonalli-memo/pull/33), Squash and Merge `6d6860b610b8437fbd7462016b5ba582be0928eb`. Revisión manual de Codex completada **sin problemas importantes** para el head previo `711fa36b07133d7bab9959fc484c4c0d6531fe1c`; GitHub Actions de ese head: **SUCCESS**, [run 40351652808](https://github.com/xolosArmy/tonalli-memo/actions/runs/40351652808).

**Suite:** [`apps/indexer/test/engine/d07-conf-01.test.ts`](https://github.com/xolosArmy/tonalli-memo/blob/main/apps/indexer/test/engine/d07-conf-01.test.ts). Incluye fixtures de scripts OP_RETURN construidos con bytes crudos y ejecución offline del flujo `MemoVerificationService → IndexingEngine → SQLite in-memory`.

| Vector / condición | Resultado comprobado | Persistencia |
| --- | --- | --- |
| `event_data` UTF-8 inválido (`c3 28`) | `INVALID_TM1` / `INVALID_UTF8` | `INVALID_MEMO` en SQLite; diagnóstico preservado; sin publicación en feed verificado |
| `event_data` de **213 bytes** (script de 224 bytes) | `INVALID_TM1` / `PAYLOAD_TOO_LARGE` | Diagnóstico durable; sin payload verificado |
| Empuje no mínimo en envelope o marcador LOKAD | `INVALID_TM1` / `INVALID_FORMAT` | Diagnóstico durable; sin payload verificado |
| `event_data` de **212 bytes** (script de 223 bytes) | `VERIFIED_TM1` | Texto completo y longitud 212 preservados |
| TM1 válido + otro candidato TM1 malformado | `MULTIPLE_MEMOS` | Rechazo del registro como publicación verificada |
| TM1 inválido seguido por TM1 válido; dos variantes (UTF-8 y exceso) | Primero `INVALID_TM1`, después `VERIFIED_TM1` | Intentos independientes; inválido excluido del feed; válido preservado |

**Alcance demostrado:** continuidad **secuencial del motor de indexación**, clasificación explícita de errores de protocolo y persistencia separada en SQLite temporal. Los errores de formato detectados por el parser se traducen a **resultados** `INVALID_TM1` en la frontera del verificador; no corresponde describirlos como excepciones de red propagadas o como eliminación/purga de transacciones de la cadena.

**Alcance NO demostrado por este PR:** ejecución de esos fixtures mediante el ciclo real de backfill del `IndexerDaemon`, checkpoint y recuperación después de reinicio, tolerancia ante fallas inesperadas del servicio/SQLite, ni revisión exhaustiva de publicaciones históricas minadas. Permanecen **PENDIENTES DE CONFORMIDAD**, y no se deben prometer garantías absolutas de ausencia de corrupción de estado para todos los casos. El PR #33 añadió solo tests y no modificó el verificador operativo ni realizó broadcast.

### 3.5 Estado documental histórico y publicación productiva

`tm1-spec.md` continúa marcado **Draft 0.2**, con una advertencia histórica sobre la emisión de transacciones en producción previa a su finalización. La auditoría describe uso productivo posterior. **Puerta de conformidad:** conciliar explícitamente la cronología, el requisito de finalización n.º 6 del borrador y su evidencia real; no eliminar la advertencia ni declarar cumplimiento retrospectivo sin revisión.

### 3.6 Separación entre núcleo y operación

No convertir lag, uptime, frecuencia de checkpoints, límites de peticiones, cronología del backfill o respaldos SQLite en campos/bytes normativos del OP_RETURN. Afirmaciones sobre reconstrucción histórica completa requieren prueba de descubrimiento de TXIDs, seguimiento de cadena y metadata necesaria. La política de no autoridad local no garantiza por sí sola que todos los datos de operación sean recuperables.

### 3.7 Matriz de estado de conformidad — D07-CONF-01 a 04

| Control | Estado verificable al preparar esta revisión | Evidencia y límite de la afirmación |
| --- | --- | --- |
| **D07-CONF-01 — malformaciones, límites y continuidad** | **VALIDADO EN PRUEBAS** | [PR #33](https://github.com/xolosArmy/tonalli-memo/pull/33), integrado en `main` mediante squash `6d6860b610b8437fbd7462016b5ba582be0928eb`. Fixtures y SQLite temporal; no sustituye auditoría de cadena real. |
| **D07-CONF-02 — autoría designada P2PKH** | **VALIDADO EN PRUEBAS** | [PR #34](https://github.com/xolosArmy/tonalli-memo/pull/34), squash `a232b26ec99eaac5fac7a340baaebb04492c1b6a`. Política estructural `trusted-chronik`, no verificación criptográfica offline independiente. |
| **D07-CONF-03 — recuperación del daemon y backfill** | **VALIDADO EN ENTORNO DE PRUEBAS** | [PR #35](https://github.com/xolosArmy/tonalli-memo/pull/35), squash `d1930c2ad0ac970fdbb7cb4b88371256639702b8`. Reinicio del daemon y reapertura de archivo SQLite temporal, conservación de auditoría y checkpoints incompletos, reorg y reconexión simuladas. **No** prueba pérdida de energía, `SIGKILL` real, nodos de producción o garantía universal de ausencia de corrupción. |
| **D07-CONF-04 — herramienta de compatibilidad histórica Draft 0.2** | **VALIDADA EN PRUEBAS Y EN MUESTRA MAINNET DELIMITADA** | [PR #36](https://github.com/xolosArmy/tonalli-memo/pull/36), squash `8393670503be6d46e5badb9ea7c29e7597bb4c26`. [Lector de solo lectura](../../scripts/d07-conf-04-historical-audit.mjs), [tres TXIDs documentados](./d07-conf-04-mainnet-candidates.json), tests offline y [guía](./D07-CONF-04-historical-audit.md). **Primera ejecución mainnet: 3/3 `VERIFIED_TM1`, sin errores**, [run 40528073357](https://github.com/xolosArmy/tonalli-memo/actions/runs/40528073357), con veredicto **`SAMPLE_COMPATIBLE_NOT_RATIFICATION`**. El éxito de tres TXIDs no demuestra compatibilidad histórica universal. |
| **Ejecución histórica contra Chronik mainnet** | **MUESTRA INICIAL REALIZADA (3/3); AMPLIACIÓN PENDIENTE** | [Ejecución 40528073357](https://github.com/xolosArmy/tonalli-memo/actions/runs/40528073357) vía `https://chronik.e.cash`, usando el manifiesto de tres TXIDs de [PR #36](https://github.com/xolosArmy/tonalli-memo/pull/36). Ver sección 3.8 para las alturas, hashes y el reporte archivado. Pendientes inventario ampliado, casos límite reales, cronología de Draft 0.2 y limitaciones `trusted-chronik`. |
| **Ratificación TM1 Core v1.0** | **PENDIENTE / NO RATIFICADO** | Requiere cerrar las puertas normativas y una decisión humana expresa mediante otro PR de ratificación; no se activa `REPLY` ni se modifica la Wallet por la integración de estos controles. |

**Control D07-CONF-03 (alcance empírico):** La suite [`apps/indexer/test/daemon/d07-conf-03.test.ts`](../../apps/indexer/test/daemon/d07-conf-03.test.ts) utilizó Chronik/WebSocket simulados y un archivo SQLite temporal que se cerró y reabrió en las pruebas de persistencia. Verificó que los intentos de indexación previos al cierre sobreviven con sus identificadores y contenidos, que los reintentos no crean entradas duplicadas en el feed, que un cursor incompleto persiste entre conexiones y que una transacción huérfana se marca `INVALIDATED` en vez de eliminarse físicamente del registro. GitHub Actions [run 40363136037](https://github.com/xolosArmy/tonalli-memo/actions/runs/40363136037): **SUCCESS**; Codex Connector revisó el head `c9cdeacf89b45a62467c05159286e65b78f0a937` sin hallazgos nuevos. Los checkpoints son cursores/altura/hash, **no** instantáneas de SQLite; los límites de páginas no prueban un rate limit temporal frente a Chronik.

**Control D07-CONF-04 (alcance empírico):** El script `scripts/d07-conf-04-historical-audit.mjs` reutiliza `ChronikTransactionClient` y `verifyNormalizedTransaction`, distingue `STRUCTURALLY_COMPATIBLE`, `REVIEW_REQUIRED`, consulta no concluyente y discrepancias de fuente, y genera JSON sin ejecutar firma, broadcast ni escrituras SQLite. GitHub Actions [run 40376012586](https://github.com/xolosArmy/tonalli-memo/actions/runs/40376012586): **SUCCESS**; la revisión manual de Codex del head `dcb9ad5f6cae35c1b6e971e44fa092f186770870` quedó completada sin hallazgos. La fuente editorial del manifiesto no verifica por sí sola inclusión en cadena, validez de firmas o qué versión de Draft 0.2 generó cada transacción. La clasificación `STRUCTURALLY_COMPATIBLE` depende de `trusted-chronik`; la lectura de una muestra no constituye ratificación.

### 3.8 Primera auditoría real de TXIDs históricos mainnet — D07-CONF-04

**Estado del expediente: `SAMPLE_COMPATIBLE_NOT_RATIFICATION`.** La herramienta probada en [PR #36](https://github.com/xolosArmy/tonalli-memo/pull/36) se ejecutó **de forma real y solo lectura frente a Chronik eCash mainnet** mediante el [PR temporal #37](https://github.com/xolosArmy/tonalli-memo/pull/37) (borrador no fusionado). GitHub Actions [run 40528073357](https://github.com/xolosArmy/tonalli-memo/actions/runs/40528073357), 2026-10-27 15:09 UTC, terminó **SUCCESS**; el analizador salió con código **0**. El workflow auditado en la rama temporal tiene HEAD `1cbd0ce61610425508d69b2b60435c81a8fbcb53`, derivado de `main` `8393670503be6d46e5badb9ea7c29e7597bb4c26` mediante un cambio de CI para esta ejecución, no una modificación del verificador TM1.

**Fuente:** `https://chronik.e.cash` (cliente y normalización de Chronik existentes); manifiesto [`d07-conf-04-mainnet-candidates.json`](./d07-conf-04-mainnet-candidates.json), tres TXIDs previamente publicados. **Resultado:** `inspected=3`, `compatible=3`, `requiresReview=0`, `inconclusive=0`. Cada transacción fue encontrada como confirmada y devolvió `VERIFIED_TM1` / `STRUCTURALLY_COMPATIBLE`; todas emplearon `authorInputIndex=0` y sighash `0x41` (`65` decimal), bajo `trusted-chronik`.

| TXID completo | Referencia editorial | Altura de bloque | Hash de bloque observado | `eventDataBytes` / `scriptBytes` | Clasificación |
| --- | --- | ---: | --- | ---: | --- |
| `fadee1662482e302fcac768686085baa8f67ea9b67d846dfea100a0de1dcd9fd` | Primer canary TM1 | 965957 | `00000000000000003b25b96ec23a48cfb9adc5c32f6a17854c4a1e48635e9d49` | 63 / 73 | `VERIFIED_TM1` |
| `8539b6f59912009f8f4fd322bf67266063233c101a4b54aa0a765ad0c9955ff8` | Primera ingesta desde mempool | 966182 | `000000000000000014df2a71da2969462991f7f10faf59bfd8b6ca19e54424b5` | 80 / 91 | `VERIFIED_TM1` |
| `0c96216decc99af759517cf2143e2bd22ea179d48a9280635c8cd1c1eb6b0150` | Primer Memo + NFT | 966215 | `000000000000000057ab28172e7fe03ec76f05629b1a47d6435ded377dfe2b6c` | 125 / 136 | `VERIFIED_TM1` |

**Cadena de custodia y reproducibilidad:** [logs de la ejecución](https://github.com/xolosArmy/tonalli-memo/actions/runs/40528073357), [artifact `12744812743`](https://github.com/xolosArmy/tonalli-memo/actions/runs/40528073357/artifacts/12744812743) con `d07-mainnet-audit-report.json` y `d07-mainnet-audit-stderr.txt`, y SHA-256 del ZIP publicado por GitHub Actions: `24d8952561b73d630f73990c316a224d942a6f3585c8e6217a3d4bfe5859807a`. El artifact tiene **retención limitada hasta 2026-11-26 15:09 UTC**, no debe describirse como archivo perpetuo; por eso esta acta preserva identificadores, observaciones, hashes y contexto de la corrida. Una repetición futura consulta el estado de cadena en ese momento y puede diferir en caso de reorgs o cambios del proveedor.

**Límites:** `historicalDraft02ProvenanceVerified=false`; la fuente editorial identifica los TXIDs pero no prueba de manera independiente qué revisión de Draft 0.2 se usó para firmarlos. La validación no recalcula de forma independiente las firmas eCash (modelo `trusted-chronik`). **Tres observaciones compatibles no demuestran una tasa poblacional de falsos negativos de cero** ni acreditan cobertura exhaustiva, Unicode complejo, P2SH, sobres múltiples, tamaños máximos u otras fronteras históricas. Tampoco implican ratificación de TM1 Core v1.0.

### 3.9 Consulta exploratoria preparada — ampliar muestra histórica sin escribir en mainnet

**Herramienta disponible en `main`:** [`scripts/d07-conf-04-historical-audit.mjs`](../../scripts/d07-conf-04-historical-audit.mjs). Su opción `--discover` consulta mediante Chronik páginas de transacciones confirmadas asociadas al LOKAD TM1 `544d4d00` y verifica hasta el número máximo de TXIDs solicitado con el verificador actual. Esta ejecución ampliada **queda propuesta, no realizada ni aprobada como barrido exhaustivo**:

```bash
node scripts/d07-conf-04-historical-audit.mjs \
  --chronik-url https://chronik.e.cash \
  --discover --pages 20 --page-size 100 --max-txids 200 \
  > d07-conf-04-exploratorio-mainnet.json
```

Los límites (`20` páginas inspeccionadas, tamaño `100`, hasta `200` TXIDs analizados) son un **presupuesto exploratorio**, no una enumeración de todo el historial. El script reparte los índices de páginas dentro del total observado; no visita necesariamente todas las páginas y solo detecta candidatos descubiertos bajo ese LOKAD. Para una cohorte histórica definida se debe **verificar externamente** la fecha/altura efectiva de vigencia de Draft 0.2 y, si se justifica, usar `--historical-max-height N` con un `N` documentado; las alturas de los tres ejemplos no prueban por sí solas el inicio/fin de Draft 0.2. Conservar commit usado, endpoint, instante UTC, tip, TXIDs y JSON, y revisar desajustes de confirmación o cambios de cadena.

**Segunda fase de selección de fronteras (aún pendiente):** el reporte actual ofrece `eventDataBytes`, `scriptBytes`, estado de verificación y política sighash, pero **no expone el texto del evento ni clasifica por categorías Unicode**, y no identifica por sí mismo combinaciones de marcadores o candidatos alternativos. Para investigar estos casos, diseñar una extensión offline/de solo lectura que inspeccione el `eventData` y los `opReturnOutputs` ya normalizados (sin firmar ni publicar), reporte **métricas/indicadores reproducibles** y seleccione TXIDs por: caracteres de varios bytes y combinantes/emoji, cercanía al límite de 212 bytes de datos / 223 de script, `authorInputIndex` diferente de cero, sighash `0xc1`, múltiples OP_RETURN y coexistencia de marcadores ajenos. Distinguir **no observado en la muestra** de **inexistente on-chain**; documentar errores de consulta y publicar cualquier extensión en PR independiente con CI y revisión Codex. **No promover a producción ni ratificar v1.0 por esta exploración.**

## 4. Tres estados de gobernanza

- **ACEPTADO:** decisión propuesta consistente con la dirección de arquitectura y susceptible de ratificación tras los controles indicados; no equivale a cambio promulgado hasta la aprobación formal.
- **PENDIENTE DE CONFORMIDAD:** divergencia documental/código, evidencia insuficiente, pruebas ausentes o disposición de compatibilidad que debe resolverse **antes de ratificar v1.0**.
- **DIFERIDO:** función fuera del alcance v1.0; ninguna autorización implícita para implementarla o desplegarla.

## 5. Puertas para una ratificación posterior

1. Mantener separadas la regla wire de unicidad TM1 y la política de unicidad de candidatos Tonalli en el verificador. **TM1+TM0**, **TM1+OP_RETURN ajeno** (PR #32) y **TM1 válido + segundo TM1 malformado** (PR #33) cuentan ya con regresiones y CI exitoso; continúa pendiente precisar compatibilidad histórica y si la política combinada se publica como perfil de aplicación independiente.
2. **Avance D07-CONF-02:** índices designados no cero, ausencia de metadata de prevout, rechazo P2SH/multifirma, scriptSig, HASH160 y sighash ya cuentan con pruebas de integración y persistencia SQLite (PR #34, CI y Codex favorables). **Pendiente:** trasladar la separación normativa `trusted-chronik` vs. verificador criptográfico independiente a la especificación candidata y conciliar evidencia de uso histórico.
3. Revisar exhaustivamente el resto de divergencias e inconsistencias de la auditoría D-07 y la especificación Draft 0.2, incluidos los requisitos formales de finalización, la cronología de publicaciones históricas y la comparación con RMZWallet. **D07-CONF-04** aporta lector de solo lectura y pruebas offline ([PR #36](https://github.com/xolosArmy/tonalli-memo/pull/36)); la **primera muestra real mainnet ya se ejecutó** ([run 40528073357](https://github.com/xolosArmy/tonalli-memo/actions/runs/40528073357): 3/3 compatibles, `SAMPLE_COMPATIBLE_NOT_RATIFICATION`). **Pendientes** ampliar la muestra, analizar posibles casos límite/compatibilidad negativa y probar la procedencia/cronología real de Draft 0.2; la muestra positiva no cierra esta puerta.
4. **Avances D07-CONF-01 y D07-CONF-03:** el PR #33 cubre UTF-8 inválido, límites de 223/224 bytes, pushes no mínimos, múltiples candidatos y continuidad secuencial; el PR #35 añade pruebas del **daemon real con Chronik simulado**, backfill, reapertura del archivo SQLite, cursores persistentes, reorgs y reconexión. **Pendiente:** validar contingencias reales de proceso/infraestructura cuando corresponda, no atribuir garantías universales de recuperación ni rate-limiting temporal no probado, y consolidar la tabla completa de eventos reservados, sighash y errores con evidencia reproducible.
5. Obtener aprobación humana explícita del texto final; fusionar **otro PR de ratificación** que sustituya `Draft 0.2` solo cuando se cumplan las puertas y se identifique versión, SHA de referencia y fecha de vigencia.

**Resultado de esta acta:** `D-07 = READY FOR NORMATIVE REVIEW / ACTA PREPARATORIA`. **NO RATIFICADO**. La publicación de este acta, incluso si se fusiona, no constituye ratificación automática, firma jurídica ni activación de `REPLY`.

## 6. Trazabilidad y límites

- Documento origen: Auditoría Técnica Protocolo TM1 Core, entregables A–F (Drive).
- Especificación técnica previa: [TM1 Draft 0.2](../protocol/tm1-spec.md).
- Código de referencia: repositorio `xolosArmy/tonalli-memo`, base `b50991de2bbdb1b284456006ded9979a6eecd36d`.
- No se alteran código, esquemas, fixtures, permisos Wallet, firmas, fondos, datos SQLite, ni operación de Contabo al proponer este acta.
