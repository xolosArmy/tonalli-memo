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

### 3.4 Reglas de capacidad y push mínimo

`MAX_TM1_SCRIPT_BYTES=223`, `MAX_TM1_EVENT_DATA_BYTES=212`, `POST=0x01` y el rechazo de eventos distintos se encuentran en el parser/encoder. Los test del parser cubren valores de borde, UTF-8 estricto, pushes no mínimos y rechazo de `0x02`. Estos límites son de compatibilidad y política de aplicación; no sustituirlos por «consenso eCash».

### 3.5 Estado documental histórico y publicación productiva

`tm1-spec.md` continúa marcado **Draft 0.2**, con una advertencia histórica sobre la emisión de transacciones en producción previa a su finalización. La auditoría describe uso productivo posterior. **Puerta de conformidad:** conciliar explícitamente la cronología, el requisito de finalización n.º 6 del borrador y su evidencia real; no eliminar la advertencia ni declarar cumplimiento retrospectivo sin revisión.

### 3.6 Separación entre núcleo y operación

No convertir lag, uptime, frecuencia de checkpoints, límites de peticiones, cronología del backfill o respaldos SQLite en campos/bytes normativos del OP_RETURN. Afirmaciones sobre reconstrucción histórica completa requieren prueba de descubrimiento de TXIDs, seguimiento de cadena y metadata necesaria. La política de no autoridad local no garantiza por sí sola que todos los datos de operación sean recuperables.

## 4. Tres estados de gobernanza

- **ACEPTADO:** decisión propuesta consistente con la dirección de arquitectura y susceptible de ratificación tras los controles indicados; no equivale a cambio promulgado hasta la aprobación formal.
- **PENDIENTE DE CONFORMIDAD:** divergencia documental/código, evidencia insuficiente, pruebas ausentes o disposición de compatibilidad que debe resolverse **antes de ratificar v1.0**.
- **DIFERIDO:** función fuera del alcance v1.0; ninguna autorización implícita para implementarla o desplegarla.

## 5. Puertas para una ratificación posterior

1. Mantener separadas la regla wire de unicidad TM1 y la política de unicidad de candidatos Tonalli en el verificador. **Test TM1+TM0 existente y test TM1+OP_RETURN ajeno completado en PR #32 (CI `success`)**; todavía revisar/agregar cobertura transaccional de segundo TM1 malformado, precisar la compatibilidad histórica y definir el alcance del perfil de aplicación.
2. Actualizar el candidato normativo para expresar `author_input_index` explícito (no fijado a cero) y acotar el modelo `trusted-chronik` frente a verificación criptográfica independiente.
3. Revisar exhaustivamente el resto de divergencias e inconsistencias de la auditoría D-07 y la especificación Draft 0.2, incluidos los requisitos formales de finalización; recopilar resultados CI y comparación con RMZWallet.
4. Publicar una tabla de compatibilidad para bytes/script, eventos reservados, sighash, errores, UTF-8 y mínimos pushes, citando pruebas reproducibles.
5. Obtener aprobación humana explícita del texto final; fusionar **otro PR de ratificación** que sustituya `Draft 0.2` solo cuando se cumplan las puertas y se identifique versión, SHA de referencia y fecha de vigencia.

**Resultado de esta acta:** `D-07 = READY FOR NORMATIVE REVIEW / ACTA PREPARATORIA`. **NO RATIFICADO**. La publicación de este acta, incluso si se fusiona, no constituye ratificación automática, firma jurídica ni activación de `REPLY`.

## 6. Trazabilidad y límites

- Documento origen: Auditoría Técnica Protocolo TM1 Core, entregables A–F (Drive).
- Especificación técnica previa: [TM1 Draft 0.2](../protocol/tm1-spec.md).
- Código de referencia: repositorio `xolosArmy/tonalli-memo`, base `b50991de2bbdb1b284456006ded9979a6eecd36d`.
- No se alteran código, esquemas, fixtures, permisos Wallet, firmas, fondos, datos SQLite, ni operación de Contabo al proponer este acta.
