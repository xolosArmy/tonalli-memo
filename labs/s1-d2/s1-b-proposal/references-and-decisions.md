# Referencias congeladas y decisiones pendientes

**Documento propuesto; ninguna autorización de implementación. S1-B y REG-11B permanecen NO AUTORIZADOS.**

## Referencias exactas

| ID | Referencia y SHA exacto | Uso y límite |
| --- | --- | --- |
| R-01 | Base `main`: `228d1f036643ca9be8ba85e91f8200536f3242da` | Base del nuevo PR documental; confirmada por lectura del remoto. No usar el `main` local divergente como base. |
| R-02 | [PR #43](https://github.com/xolosArmy/tonalli-memo/pull/43): `7d5b91283085871565e784c717ddc14b6736af46` | HEAD aceptado para S1-A offline; nueve archivos nuevos bajo `labs/s1-d2/`; Draft, abierto, sin merge al consultar. El `merge_commit_sha` sintético de GitHub no es un merge adoptado. |
| R-03 | Código auditado: `38f16abe99f7fb229fa4eb23b1c73b239b4ab22b` | Tepoztli según actas; delta estático hasta R-02: solo README, 16 inserciones/3 eliminaciones. Guardrails idénticos. |
| R-04 | Documentación intermedia: `e332a5c142763c3a33267f4a98c2fb25ca755dec` | R-02 cambia solo dos etiquetas H-1/H-2 respecto de este commit. Evitar invertir los hallazgos. |
| R-05 | [PR #40](https://github.com/xolosArmy/tonalli-memo/pull/40): `762582248fb183ce3f9c3fc69b22f1ae5242780a` | RFC M1.9.3/4 y M1.10 como propuesta, sin incorporarlo ni ratificarlo. |
| R-06 | [PR #41](https://github.com/xolosArmy/tonalli-memo/pull/41): `b85a6b5b2fd9e4bfd9fb25cc6f52cd1bfd5c1823` | Matriz S0 de referencia, sin modificar ni promover estados. |
| R-07 | [PR #42](https://github.com/xolosArmy/tonalli-memo/pull/42): `081d75a762889207283ab7d4434030db30c79b41` | Referencia de regtest, no autorización ni demostración D2. |
| R-08 | [Bitcoin ABC tag v0.34.2](https://github.com/Bitcoin-ABC/bitcoin-abc/commit/d6674af70e312595297e0bc2a3c08fc09d91d044): `d6674af70e312595297e0bc2a3c08fc09d91d044` | Fuente upstream consultada; no equivale al SHA-256 del ejecutable local ni valida su procedencia. No se ejecutó el binario. |

La comparación de guardrails se apoya en los objetos Git presentes y en el inventario de R-02: `allowlist.mjs`, `endpoints.mjs`, `evaluate.mjs`, `fixtures.mjs`, `flags.mjs`, `permissions.mjs`, `reg11a.test.mjs`, `secrets.mjs` y README. Se examinaron en detalle README, allowlist, endpoints, evaluador y estructura de pruebas; no se reauditaron íntegramente todos los parsers ni se reprodujo la suite. No se fusiona ni se copia su implementación en esta rama.

## Actas, auditoría y precedencia

| Fuente | Conclusión aplicable |
| --- | --- |
| [Cuarta Acta 6691530523](https://github.com/xolosArmy/tonalli-memo/pull/40#issuecomment-6691530523) | Autorizó guardrails offline S1-A; separó REG-11A y REG-11B; lista futura de endpoints, no conexión. |
| [Quinta Acta 6709364836](https://github.com/xolosArmy/tonalli-memo/pull/40#issuecomment-6709364836) | Expediente histórico de auditoría favorable con condiciones, H-1/H-2 medias; H-3–H-8 bajas y límites. |
| [Neutralidad 6709455572](https://github.com/xolosArmy/tonalli-memo/pull/40#issuecomment-6709455572) | Revisión independiente humana o IA; sustituye solo la exigencia de identidad humana. No autoriza fases. |
| [Sexta Acta 6709563778](https://github.com/xolosArmy/tonalli-memo/pull/40#issuecomment-6709563778) | Decisión expresa de Fernando del 2026-11-07: cierra S1-A offline en R-02; mantiene S1-B/REG-11B prohibidas. |
| [Codex 6709152871](https://github.com/xolosArmy/tonalli-memo/pull/43#issuecomment-6709152871) | Recibo sin problemas mayores en R-02; no prueba aislamiento ni habilita una fase. |
| [CI 42387312600](https://github.com/xolosArmy/tonalli-memo/actions/runs/42387312600) | `success` según Sexta Acta; CI productivo no ejecuta REG-11A. No se reejecutó ni se atribuye REG-11B. |

La evidencia atribuida a Tepoztli es: REG-11A 14/14 repetidas dos veces sobre R-03, 34 sondas propias adicionales y 80 casos negativos existentes, sin red. No se suman esos conteos como nuevas pruebas de este encargo. El informe original, sus hashes, comandos, resultados y custodia no se localizaron en el material del PR; su incorporación sigue pendiente (D-10). Las actas son evidencia primaria de la decisión y de lo que esta declara, no sustituyen los artefactos originales de la auditoría.

## Autoría técnica, revisión y autoridad

Se distingue la atribución de funciones del encargo de la participación efectiva en cada versión. Se aplica la [resolución de neutralidad 6709455572](https://github.com/xolosArmy/tonalli-memo/pull/40#issuecomment-6709455572): la independencia depende de la ausencia de participación en la elaboración del contenido revisado y de evidencia trazable, no de que el revisor sea humano o IA.

| Participante | Función y límite |
| --- | --- |
| **Antigravity** | Autor técnico del expediente S1-B según la atribución del encargo. Esta atribución de responsabilidad no sustituye el registro de quién elaboró materialmente cada versión ni permite contar a su autor como revisor independiente. |
| **Codex** | Revisor independiente automatizado cuando la instancia revisora no haya participado en la elaboración del contenido examinado. La revisión solicitada a `chatgpt-codex-connector[bot]` en GitHub debe identificar el nuevo HEAD completo, método, resultado y límites. Compartir marca/modelo con un autor no prueba participación, pero tampoco acredita independencia por sí solo. |
| **Tepoztli** | Revisor documental independiente complementario, cuando corresponda y quede identificado su informe, SHA examinado, método y ausencia de participación en la autoría. Su auditoría histórica de S1-A conserva el alcance de las actas; no se presenta como revisión ya realizada del nuevo expediente S1-B. |
| **Fernando** | Responsable del proyecto y autoridad exclusiva para aprobar avances y aceptar riesgos/alcances mediante decisiones expresas ligadas a PR/SHA. Autores, operadores y revisores aportan evidencia y recomendaciones; no conceden autorizaciones. |

**Procedencia material y conflicto de autoría:** el expediente publicado en `b0dd61769a822926871aa14623ef4fd31318f5e2` fue redactado y materializado por una sesión de Codex en este historial de trabajo; esta misma sesión prepara las correcciones documentales actuales. Se registra esa participación sin atribuir falsamente esas acciones a una ejecución de Antigravity. La sesión redactora no se cuenta como revisión independiente de su propio contenido. El rol de revisor se refiere a una ejecución distinta sin participación en la elaboración; su elegibilidad y evidencia deben quedar documentadas. La cuenta que publica un commit o comentario no demuestra por sí sola identidad del autor técnico ni independencia del revisor.

No se exige revisión humana adicional por el solo uso de IA. Una revisión independiente favorable, automatizada o humana, no es autorización de S1-B/REG-11B ni sustituye la decisión exclusiva de Fernando. Los recibos sobre `b0dd61769a822926871aa14623ef4fd31318f5e2` son históricos: ninguna corrección posterior hereda su resultado sin nueva revisión del HEAD resultante.

## Estrategia propuesta de integración S1-A → S1-B

**Plan exclusivamente documental; no se crean ramas de implementación ni se ejecutan integraciones, cherry-picks, restores, merges o pruebas por este encargo.** Publicar estas correcciones en la rama documental existente no integra S1-A. La secuencia siguiente solo podrá ejecutarse bajo otra orden expresa de Fernando que fije base, alcance y SHA.

Definir antes de operar tres referencias completas e inmutables: **A** = S1-A aceptada `7d5b91283085871565e784c717ddc14b6736af46`; **D** = HEAD exacto del PR #44 cuyas correcciones hayan sido revisadas y aceptadas documentalmente (registrarlo después de publicar, sin autorreferencia circular en este commit); **M** = base de `main` expresamente aprobada para la futura fase. La base histórica de A y de este expediente es `228d1f036643ca9be8ba85e91f8200536f3242da`; un cambio de `main` no autoriza rebase o integración automática.

| Paso futuro | Operación documentalmente especificada | Verificación y motivo |
| --- | --- | --- |
| I-01 — congelar insumos | Registrar A, D y M, sus árboles/parents, los nueve paths originales de A y sus Git blob SHA; conservar los manifiestos e informes históricos sin reescritura. Usar checkout limpio y aislado para cada referencia. | Impedir que nombres de ramas móviles, un PR actualizado o el SHA sintético de merge sustituyan a la referencia aceptada. |
| I-02 — derivación recomendada | Crear una **nueva rama futura de implementación directamente desde A**, conservándolo como ancestro. No basarla únicamente en `main`, que no contiene los guardrails de PR #43. | Antes de cualquier código nuevo, árbol y blobs de los nueve archivos S1-A deben coincidir exactamente con A. Esta derivación no fusiona PR #43 a `main`, no acepta commits futuros de #43 y no concede permiso de conexión. |
| I-03 — incorporar solo expediente | Desde D, copiar/materializar únicamente el subárbol `labs/s1-d2/s1-b-proposal/` a esa rama en un commit documental separado, con A y D completos en el mensaje. No aplicar solo el último commit correctivo de #44: su delta presupone los documentos anteriores. No mezclar otros paths del árbol de D. | Comparar todos los blobs del subárbol copiado con D y validar su manifiesto; comprobar que los nueve archivos originales de A siguen idénticos. No se fusiona #44 a `main`. |
| I-04 — ampliación explícita | En commits posteriores y solo con autorización, añadir implementación/arnés de laboratorio y una política de inventario ampliada revisable. Mantener separado el commit de importación documental del cambio de código y de tests. | Un diff completo respecto de A y otro respecto del commit documental identifican qué es reutilización, documentación y nuevo control efectivo. No modificar PR #43, RFC, matriz S0, producto o workflows por implicación. |
| I-05 — revisión del resultado | Congelar el SHA completo resultante, su mapa de procedencia y diff permitido; solicitar nueva revisión independiente de ese **SHA combinado**, incluyendo H-1/H-2, inventario y separación de capacidades. | Revisar #43 y #44 por separado no acredita su integración ni el runtime añadido. Fernando decide expresamente cualquier avance; las conexiones/REG-11B requieren autorización propia posterior. |

**Alternativa equivalente:** si Fernando aprueba una base M diferente, reconstruir sobre ella un commit de importación que aplique exactamente el delta S1-A desde su base histórica hasta A. Exigir igualdad de los nueve Git blobs con A, igualdad del delta de laboratorio y un mapa verificable A → commit de importación, con parents y SHA completos. Ante conflicto, falta de objetos o diferencia de contenido, detener: no resolver silenciosamente ni llamar equivalente a una adaptación. Incorporar después el subárbol documental de D como en I-03 y revisar el SHA combinado. La equivalencia de contenido no implica equivalencia de entorno o seguridad; requiere decisión de Fernando y revisión independiente adicional. Ninguna variante necesita merge prematuro de #43 o #44 a `main`.

### Inventario REG-11A y evidencias históricas

REG-11A en A enumera exactamente nueve archivos, recorre `labs/` y comprueba el diff y `origin/main` contra la base histórica. Añadir este expediente u otro arnés amplía ese inventario; mover `origin/main` también puede afectar sus aserciones. Por tanto, **no se afirmará que la suite original pasa sin cambios en la rama combinada**, ni se relajarán sus aserciones para producir retrospectivamente una corrida verde.

Para una futura reproducción autorizada, conservar un checkout histórico dedicado de A, con los nueve archivos y las referencias Git históricas esperadas, sin el expediente añadido. Registrar resolución de refs, árbol/blobs, checkout limpio, orden, salida, entorno, timestamps y hashes; no mover ni falsear refs del repositorio de trabajo para satisfacer la prueba. Si se necesita una ref histórica `origin/main`, usar un repositorio de reproducción aislado que registre explícitamente su fijación a `228d1f036643ca9be8ba85e91f8200536f3242da`, sin atribuirla al estado actual del remoto. El resultado reproduce solo A, no la futura integración.

En la rama combinada, proponer **una suite ampliada separada** y su inventario cerrado, derivada y trazada caso por caso a REG-11A de A. Mantener inalterada la suite original de A como evidencia histórica; la suite ampliada podrá existir en paths nuevos de laboratorio únicamente bajo aprobación posterior. Revisar cada adición permitida de paths y cada cambio de aserción, justificarlo y verificar que no debilita los casos negativos, el rechazo previo a I/O, los defaults DENY/OFF o la prohibición de cambios productivos. No eliminar checks de inventario o convertirlos en comodines abiertos. Las evidencias de ambas suites se almacenan por SHA y alcance, con resultados y fallos conservados por separado.

La reutilización exacta de los guardrails S1-A demuestra continuidad del control **offline**. No implementa ni demuestra aislamiento SO/red, permisos externos, listeners/peers, broker, concesiones o contrato obligatorio H-1/H-2. Estos son controles nuevos de S1-B, sujetos a implementación autorizada, revisión independiente del SHA resultante y evidencia efectiva REG-11B bajo una orden de ejecución distinta. Aquí no se ejecuta ninguna de esas suites ni se adopta la política ampliada.

## Análisis técnico del PR #43

`allowlist.mjs` congela cadenas para `regtest`, los dos endpoints, datadir y directorio de binarios. `evaluateConfiguration` clasifica objetos y devuelve `ALLOWLISTED_OFFLINE` sin llamar a transporte. Rechaza proxies JS, accessors y campos desconocidos mediante descriptores propios; los cambios posteriores al código auditado son documentales. Sin embargo, `classifyAdapter` permite adaptador ausente y recorre campos presentes, sin exigirlos todos, y acepta una función `connect` aunque no la invoque. Esa implementación es coherente con su simulación acotada, pero no sirve por sí sola como barrera runtime.

| Condición | Riesgo concreto | Obligación propuesta | Evidencia futura |
| --- | --- | --- | --- |
| H-1 | El consumidor reutiliza `connect` después de un resultado offline, o llama transporte sin permiso. | Consumidor sin socket/transporte genérico; broker separado con concesión por operación, revocable y ligada al acto/SHA/proceso/namespace. | REG-11B-02/03/04/20/25; denegación antes de I/O y confinamiento efectivo. |
| H-2 | Un campo omitido hereda un default inseguro de biblioteca o proceso. | Esquema cerrado obligatorio, tipos/valores exactos, instantánea estable, implementación y entorno medidos. | REG-11B-05/06/07/14/24; omisiones individuales y valores adversariales. |

H-3/H-4: los defaults de permisos/flags no validan los permisos de otro proceso. H-5–H-8: códigos diagnósticos, Unicode, escáner de secretos y checkout limpio siguen siendo límites; ningún código de error o escaneo sustituye la denegación real. Este expediente no declara corregido un hallazgo por describir su solución.

## Fuentes primarias de configuración

Se consultó el [manual bitcoind 0.34.2](https://www.bitcoinabc.org/doc/0.34.2/man/bitcoind/) para flags de red/RPC/wallet. El comportamiento efectivo de RPC se contrastó con [src/httpserver.cpp](https://github.com/Bitcoin-ABC/bitcoin-abc/blob/d6674af70e312595297e0bc2a3c08fc09d91d044/src/httpserver.cpp). El [README Chronik](https://github.com/Bitcoin-ABC/bitcoin-abc/blob/d6674af70e312595297e0bc2a3c08fc09d91d044/chronik/README.md) describe su integración y la falta de autenticación propia. [chronik.cpp](https://github.com/Bitcoin-ABC/bitcoin-abc/blob/d6674af70e312595297e0bc2a3c08fc09d91d044/chronik/chronik-cpp/chronik.cpp) determina hosts y Electrum; [kernel/chainparams.cpp](https://github.com/Bitcoin-ABC/bitcoin-abc/blob/d6674af70e312595297e0bc2a3c08fc09d91d044/src/kernel/chainparams.cpp) fija el génesis. Los Git blob SHA de estas fuentes figuran en `sources.json`; se pueden verificar contra el commit R-08. No se extrapola configuración desde Bitcoin Core ni desde otra versión de ABC.

## Registro de decisiones abiertas

Todas están **PENDIENTES**. Las recomendaciones no son decisiones adoptadas. Fernando, autoridad exclusiva de aprobación, debe resolverlas con PR/SHA exactos, fecha, evidencia, responsables y riesgos aceptados antes de la acción dependiente. Las intervenciones técnicas y de revisión indicadas en la tabla son aportes de evidencia, no autoridades alternativas.

| ID | Decisión y recomendación | Quién resuelve / bloqueo |
| --- | --- | --- |
| D-01 | Autorizar separadamente implementación aislada y, después, ejecución REG-11B; fijar SHA de cada una y base vigente. | Fernando; bloquea toda implementación y conexión. Este PR solo prepara. |
| D-02 | Elegir plataforma Linux/kernel y backend de namespaces, política por cgroup/UID y supervisor; demostrar compatibilidad y fallo cerrado. | Fernando, con propuesta técnica y revisión independiente; bloquea montaje/arranque futuro. |
| D-03 | Aprobar el artefacto ABC 0.34.2 exacto: arquitectura, origen, verificación de release, SHA-256 del archivo y ejecutable, librerías y compilación con Chronik. No actualizar versión implícitamente. | Fernando con informe técnico; bloquea uso del binario. |
| D-04 | Confirmar datadir de laboratorio, dueño/UID, ausencia de symlinks/hardlinks/montajes compartidos y si hay datos históricos. No reutilizarlos sin inventario y decisión. | Fernando, con inventario del operador designado; bloquea cualquier escritura/arranque. |
| D-05 | Reautorizar los endpoints heredados 19443/19442 en el namespace exacto y aprobar el génesis candidato `0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206`. | Fernando; la allowlist previa de strings no permite conexión. |
| D-06 | Aprobar API/implementación del broker, cliente HTTP, versión/hash, decoder Chronik y autenticación RPC; cero resolución, redirecciones o transporte alternativo. | Revisión independiente de Codex + decisión de Fernando; bloquea runtime. |
| D-07 | Adoptar límites propuestos: sesión 30 min, 1 solicitud concurrente, 2 s por solicitud, 1 MiB por respuesta, sin retries; 2 GiB RAM, 1 CPU y 5 GiB de escritura. | Fernando, con evidencia del operador; ajustar antes del arranque, nunca por fallback. |
| D-08 | Aprobar arnés negativo dentro de sandbox sacrificial, privilegios mínimos de observación, casos/corpus exactos y dos repeticiones limpias. Cero sondas reales a servicios externos/productivos. | Fernando; bloquea todas las pruebas de conexión. |
| D-09 | Designar operador, revisor ajeno a la elaboración del contenido revisado, custodio y responsable de suspensión; ubicación y retención de evidencia (propuesta: 180 días y hasta cierre del incidente, lo que sea mayor). | Fernando; bloquea sesión futura. Antigravity tiene la autoría técnica atribuida; Codex revisor automatizado debe ser una ejecución sin participación en la redacción. La sesión redactora actual no se cuenta como revisor independiente. |
| D-10 | Adjuntar informe original de Tepoztli con hash y sondas, o aceptar explícitamente la limitación documental; conservar H-1/H-2 sin dispensa. | Fernando, con aportes del custodio y revisión complementaria cuando corresponda; pendiente para evaluación íntegra del expediente. |
| D-11 | Política CI/runtime REG-11A antes de cualquier armado/firma/difusión; autorización separada para S1-C/S1-D. | Fernando; no se propone cambiar workflows aquí. |

Cambio de base, SHA, puertos, binario, política o datadir invalida la revisión afectada y exige reevaluación; no se heredan aprobaciones de un SHA anterior. No hay excepción automática por CI verde o por el carácter Draft del PR.
