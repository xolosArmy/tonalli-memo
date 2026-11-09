# Propuesta de texto técnico — Séptima Acta de Gobernanza

**BORRADOR PARA EVALUACIÓN. NO ADOPTADO, NO PUBLICADO COMO DECISIÓN DE GOBERNANZA. S1-B NO AUTORIZADA PARA IMPLEMENTACIÓN.**

El siguiente texto se propone para revisión de Fernando y revisión técnica independiente de Codex en el PR Draft documental. Su inclusión en Git no afirma consentimiento, firma, fecha de adopción o ejecución de pruebas. Al adoptarse, deberán fijarse PR y SHA exactos de la versión evaluada en un registro externo a ese mismo commit. El número «Séptima» es propuesto; debe verificarse que no exista otro acto adoptado con ese número antes de registrarlo.

---

## Séptima Acta de Gobernanza — Evaluación de preparación técnica S1-B

**Estado propuesto: EXPEDIENTE DOCUMENTAL EN REVISIÓN; SIN AUTORIZACIÓN DE IMPLEMENTACIÓN O EJECUCIÓN S1-B/REG-11B.**

### 1. Autoridad, referencias y límites

Repositorio: `xolosArmy/tonalli-memo`. Autoridad de decisión: **Fernando**, responsable del proyecto. Fecha/hora efectiva de adopción, enlace del registro, PR documental y SHA exacto evaluado: **PENDIENTES DE DECISIÓN EXPRESA Y REGISTRO**. No asumir fecha retroactiva.

Se reconoce la [Sexta Acta 6709563778](https://github.com/xolosArmy/tonalli-memo/pull/40#issuecomment-6709563778), que aceptó la salida técnica **offline** de S1-A en PR #43, SHA `7d5b91283085871565e784c717ddc14b6736af46`, con base `228d1f036643ca9be8ba85e91f8200536f3242da`. El código auditado por Tepoztli fue `38f16abe99f7fb229fa4eb23b1c73b239b4ab22b`; los cambios posteriores hasta el HEAD aceptado fueron documentales. El cierre no autorizó merge, S1-B ni REG-11B.

Se conservan como referencias sin incorporarlas: RFC-0001 PR #40 `762582248fb183ce3f9c3fc69b22f1ae5242780a`, matriz PR #41 `b85a6b5b2fd9e4bfd9fb25cc6f52cd1bfd5c1823` y referencia PR #42 `081d75a762889207283ab7d4434030db30c79b41`. Bitcoin ABC v0.34.2 upstream corresponde a `d6674af70e312595297e0bc2a3c08fc09d91d044`; el artefacto ejecutable específico y su SHA-256 siguen pendientes de aprobación.

### 2. Objeto documental propuesto

Evaluar arquitectura de aislamiento, contrato de adaptadores, matriz negativa REG-11B, límites operativos y procedimiento de suspensión/rollback/custodia bajo `labs/s1-d2/s1-b-proposal/`. La preparación no modifica código productivo, workflows, RFC ni matriz, y no incorpora implementaciones de PR Draft anteriores. La aprobación eventual de este expediente tendrá efecto documental únicamente.

Se proponen los siguientes requisitos para una futura orden operativa:

1. Bitcoin ABC 0.34.2 con Chronik integrado, binario/decoder/broker/política/arnés fijados por hash y procedencia; datadir exclusivo `/home/xolosarmy/xolosarmy-regtest/data`, dueño/modo/componentes y montajes verificados, sin acceso a datos productivos ni llaves.
2. Namespace de red dedicado con solo loopback, sin ruta exterior, interfaces externas, veth/NAT, publicación de puertos o red compartida con host. Kernel y controles por identidad deben negar salida fuera de política y listeners adicionales antes del arranque.
3. Los únicos endpoints **candidatos heredados de la allowlist offline**, sujetos a aprobación expresa de uso vivo, son RPC `http://127.0.0.1:19443` y Chronik `http://127.0.0.1:19442`. RPC requiere bind explícito y allowip IPv4 exacto; Chronik bind único. Cero DNS, proxies, redirecciones, fallback, IPv6, P2P, Electrum, ZMQ o listeners extra.
4. Identidad candidata de regtest con génesis `0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206`, aprobado previamente y después contrastado por RPC y bloque 0 de Chronik, junto con hash/procedencia del binario y mediciones del SO. No aceptar génesis aprendido como expectativa ni usar este hash por sí solo como prueba eCash.
5. Wallet deshabilitada, cero peers, cero TX/minado/llaves/fondos, flags sociales OFF y permisos de armado/firma/difusión/despliegue DENY. Las lecturas futuras se limitan a diagnósticos enumerados de infraestructura; el bootstrap de identidad requiere su propia concesión de conexiones exactas autorizada expresamente.

### 3. H-1 y H-2 como condiciones obligatorias

**H-1:** `ALLOWLISTED_OFFLINE` y una función `connect` invocable no constituyen autorización. El consumidor no recibirá transporte genérico ni credenciales; un broker confiable aislado exigirá concesiones por operación, de un uso, revocables y vinculadas a orden/PR/SHA/artefactos/sesión/proceso/namespace. El SO impedirá acceso IP directo y bypass. La implementación y la denegación efectiva requieren pruebas, no solo documentación.

**H-2:** ningún campo ausente prueba seguridad. El contrato cerrado exigirá todos los campos y valores explícitos del expediente, sin defaults ni coerción; rechazará omisiones, accessors, proxies JS, claves extra/ocultas, tipos inválidos y mutación entre chequeo/uso. Declaraciones se contrastarán con implementación fijada y estado efectivo de proceso/entorno/SO. Ningún permiso externo se da por verificado por los defaults de S1-A.

Ambas son obligaciones heredadas, no dispensas permanentes. La valoración favorable con condiciones de Tepoztli se limita a evidencia offline descrita en actas; su informe original y artefactos siguen pendientes de incorporación o aceptación expresa de esa limitación documental.

### 4. Pruebas, revisión y decisión posterior

REG-11B se mantiene **NO AUTORIZADA / NO EJECUTADA**. La matriz propuesta contiene REG-11B-01–26 con corpus negativo, resultados esperados y artefactos E-01–26; distingue offline, sandbox sacrificial y laboratorio vivo. No se usarán sondas reales a producción/mainnet/testnet, DNS o proxies externos como negativos. Aprobar el texto de la matriz no permite ejecutarla.

La futura aceptación exige dos repeticiones limpias autorizadas, evidencia íntegra, cero conexiones no autorizadas, exactamente los dos listeners, cero peers y comprobaciones efectivas de H-1/H-2, suspensión y cierre. Un caso omitido, observación perdida, fallo o evidencia inconclusa impide aceptación. REG-11A y CI verde no sustituyen estos resultados.

Se aplica la [resolución neutral 6709455572](https://github.com/xolosArmy/tonalli-memo/pull/40#issuecomment-6709455572): puede revisar una persona o IA independiente de la autoría; debe documentar SHA, métodos, hallazgos y límites. Codex autor de este expediente no cuenta como su propio revisor independiente. Un resultado favorable no autoriza por sí mismo la fase; Fernando decide expresamente con riesgos y alcance.

### 5. Suspensión, rollback y evidencia

Ante desviación de identidad/red/permisos, bypass, secreto, drift de artefactos, pérdida de control/monitor o límite operativo: revocar concesiones, cerrar transporte, mantener confinamiento, detener solo los procesos de la sesión, verificar ausencia de listeners/procesos y conservar evidencia sanitizada con hashes/custodia. Sin reinicio automático, borrado de datadir, reindex o cambios productivos de recuperación.

Operador, revisor, custodio, backend/kernel, artefactos exactos, límites, destino/retención de evidencia y decisiones D-01–D-11 quedan **pendientes**. No hay acción operativa hasta resolver las decisiones que la bloquean. El expediente detalla criterios y justificaciones; ninguna limitación se convierte en prueba satisfecha.

### 6. Resolución propuesta y estado preservado

Se propone **mantener el expediente en revisión documental** y exigir una orden separada, completa y expresa antes de cualquier implementación; la ejecución con nodo y REG-11B requerirá además autorización de su SHA de implementación revisado, entorno, responsables, periodo y pruebas concretas. Esa orden no existe en este texto y deberá registrarse por separado; una referencia a este borrador no basta.

Permanecen: S1-A cerrada solo offline; S1-B/REG-11B, S1-C, S1-D, D2, D3, D4 y mainnet NOT AUTHORIZED; RFC-0001 PROPOSED — NOT RATIFIED; S0/S0-05/M1.7.4 OPEN; `M194-INDEXER-PERSIST` NOT_DEMONSTRATED; SEC-17 mitigación productiva pendiente; Social v2 INACTIVE. Los PR #40–#43 y el nuevo Draft documental no obtienen permiso de merge o despliegue. La compuerta CI/runtime REG-11A antes de funciones de armado/firma/difusión continúa pendiente de acto distinto.

**Ninguna acción de implementación queda autorizada por esta preparación ni por la aprobación documental propuesta.**

---

Fin del texto propuesto. El registro formal, si se decide, deberá distinguir aprobación documental, autorización de implementación y autorización de ejecución; no completar campos pendientes con supuestos ni publicar esta propuesta como decisión adoptada.
