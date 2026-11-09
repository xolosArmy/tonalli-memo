# Contrato propuesto de adaptadores — H-1 y H-2 obligatorias

**Diseño; no contiene código ejecutable ni adaptador implementado.** Las funciones puras de S1-A permanecen sin cambios. No importar adaptadores productivos o SDK con fallback implícito.

## H-1: una capacidad de conexión no es un permiso

La salida de `evaluateConfiguration` es un diagnóstico, nunca un handle de sesión ni una entrada aceptable para autorizar transporte. `ALLOWLISTED_OFFLINE` no cambia el estado de autorización. La interfaz del consumidor solo tendrá solicitudes enumeradas por IPC autenticado; no expondrá `connect`, `fetch`, URL arbitraria, agente HTTP, socket, callback de resolución o acceso a credenciales. Un adaptador externo con función `connect` se rechaza en S1-B, aunque fuese aceptable para la clasificación offline de S1-A.

El transporte bruto existe únicamente dentro del **broker confiable**, con implementación/version/hash fijados y cgroup específico. No se inyecta desde objetos del consumidor. El SO niega sockets IP al consumidor, salida a otros destinos al broker y conexiones iniciadas por el nodo. Así, saltarse el wrapper no concede una ruta. La seguridad del broker no se acredita por una declaración `safe:true`: requiere revisión de código, confinamiento y observación REG-11B.

### Máquina de estados y bootstrap

| Estado | Entrada admisible | Operaciones posibles |
| --- | --- | --- |
| NOT_AUTHORIZED (actual) | Configuración/documentos offline | Ningún I/O de nodo. No se construye transporte ni se crea concesión. |
| AUTHORIZED_PREFLIGHT (futuro) | Orden expresa válida de Fernando ligada a PR/SHA/base/manifiesto/alcance, operador e intervalo | Solo supervisor prepara/verifica confinamiento aprobado; aún sin I/O de aplicación. |
| IDENTITY_BOOTSTRAP (futuro) | Preflight completo y supervisado; identidad filesystem/política/socket-owner válida | Concesión de un uso por consulta para RPC `getblockchaininfo`, `getblockhash(0)`, `getnetworkinfo`, `getpeerinfo`, `getconnectioncount`; Chronik HTTP GET `/blockchain-info` y `/block/0`. Ninguna lectura genérica. |
| VERIFIED_READ (futuro) | Resultados válidos y concordantes, versión/hash/génesis/namespace/listeners correctos; aprobación de alcance vigente | Solo los mismos diagnósticos de infraestructura y observación limitada aprobada. No ampliar a TX, UTXO, historial social o SDK por defecto. |
| SUSPENDED / CLOSED | Fallo, drift, expiración, revocación o cierre | Revocar concesiones y cerrar sesiones. Ninguna reconexión ni retry automático. |

El bootstrap resuelve la circularidad de comprobar identidad mediante una conexión: la orden futura debe autorizar **esas conexiones diagnósticas concretas** antes de conocer el estado vivo; hasta terminar la atestación, no se habilitan otras lecturas. Este documento no emite esa orden. El bootstrap es una excepción acotada al permiso de lectura general, no a la autorización de red, H-1/H-2 o los controles del SO.

### Concesión por operación

El supervisor, después de validar la orden registrada y los controles efectivos, mantiene concesiones opacas en memoria propia. El consumidor recibe solo una referencia de IPC ligada a su identidad del SO; no se acepta un JSON `authorized:true`, un string de SHA, una copia del acta, un flag de proceso o un token construido por el cliente. El protocolo de concesión se implementará y revisará en D-06; no se inventa ahora una firma o llave.

Cada concesión queda vinculada a: acta/PR/SHA autorizados, hash del manifiesto y contrato, operador, sesión, nonce monotónico de un uso, PID y tiempo de inicio (contra reutilización del PID), UID/cgroup, inode de namespaces, rol/endpoint, operación/parámetros exactos, fecha de emisión/expiración y época de revocación. Tiempo de vida propuesto: máximo 5 s y siempre inferior al cierre de sesión. El broker verifica todo **en cada operación**, consume la concesión de forma atómica antes de iniciar el I/O y nunca reutiliza la misma referencia por error/retry.

Una orden de gobernanza es un requisito de autorización; una identidad de proceso y una capability del SO/memoria hacen exigible esa autorización en runtime. Ninguna función pura puede probar por sí sola la decisión humana. Reinicio del broker, suspensión o pérdida del supervisor invalida todas las concesiones. No se restauran desde disco o logs. Concesión válida no significa REG-11B aprobada.

## H-2: esquema cerrado obligatorio y medición efectiva

Propuesta de contrato `S1B_ADAPTER_V1`. **Cada fila y cada subcampo es obligatorio**, sin defaults, campos extra, coerción, herencia o inferencia de valores ausentes. Cualquier modificación del esquema exige nueva revisión. Donde se requiere una medición o SHA aún pendiente, el contrato no puede instanciarse operativamente.

| Campos obligatorios | Valor/regla exigida |
| --- | --- |
| `schemaVersion`, `role`, `endpoint` | Versión literal anterior; rol `rpc` o `chronik`; URL exacta de ese rol, sin `/` final, ruta, query, fragmento o credenciales. |
| `chain`, `expectedGenesis` | `regtest`; hash de 64 hex display-order aprobado D-05. No aprenderlo de la respuesta para autoaprobarse. |
| `binaryPath`, `binarySha256`, `binarySourceCommit` | Ruta absoluta ABC fijada, SHA-256 aprobado del ejecutable real, upstream `d6674af70e312595297e0bc2a3c08fc09d91d044`. Ninguno sustituye a los demás. |
| `datadir`, `datadirIdentity` | Ruta exacta y registro medido de dueño, modo `0700`, dispositivo/inode, montajes y componentes sin links; misma identidad al uso. |
| `implementationId`, `implementationSha256`, `transportPolicySha256` | Artefactos revisados e inmutables. No aceptar plugins, callbacks o objetos de transporte proporcionados por consumidor. |
| `followRedirects`, `maxRedirects` | Booleano `false`; entero `0`. Rechazar `"false"`, `"0"`, null y omisión. |
| `proxy`, `proxyFromEnv`, `env` | `null`, booleano `false`, objeto de datos vacío. Este `env` describe configuración de transporte; el entorno mínimo real se mide por separado. |
| `resolve`, `lookup`, `addressFamily`, `literalAddress` | `null`, `null`, literal `IPv4`, literal `127.0.0.1`. No resolver provisto por consumidor ni lookup automático de biblioteca. |
| `autoRetry`, `maxRetries`, `fallbackEndpoints`, `allowWebSocket`, `allowUpgrade` | `false`, `0`, array vacío, `false`, `false`. Conectividad degradada no amplía destino o protocolo. |
| `requestPolicy`, `limits` | Lista cerrada de operaciones y parámetros exactos; 1 concurrente, timeout 2000 ms, respuesta máxima 1048576 bytes, sin retries. Los límites aprobados no se pueden relajar desde la solicitud. |
| `authMode`, `credentialHandle` | RPC: `lab-cookie` y handle interno opaco del broker; Chronik: `none` y null. Nunca secreto en descriptor serializable. |
| `runtimeIdentity`, `environmentEvidence`, `confinementEvidence` | Referencias de supervisor a PID/start-time/UID/cgroup/namespaces, entorno real y hash/presencia de política. Deben corresponder a esta sesión y permanecer vigentes. Una referencia ausente/caducada no se rellena con un valor seguro. |
| `authorizationContext` | Referencia opaca del supervisor a orden, estado y época. El broker contrasta su propia tabla; el campo no concede permisos por sí mismo. |
| `permissions`, `flags` | Cinco permisos `read/assemble/sign/broadcast/deploy` explícitos, todos false inicialmente; ocho flags de S1-A explícitos y false. Solo la concesión acotada de diagnóstico puede habilitar su lectura; nunca modifica los otros cuatro permisos ni flags. |

`calls` y `connect` del adaptador simulado S1-A no forman parte del descriptor S1-B y se rechazan como campos extra. Las llamadas las cuenta el supervisor desde fuera del descriptor; no se confía en `calls:[]` autodeclarado. `resolve:null`/`lookup:null` son declaraciones obligatorias que se contrastan con comportamiento; no se asume que null impide DNS en una biblioteca arbitraria.

### Orden de validación y estabilidad

1. Mantener autoridad, permiso y estado separados de la clasificación offline; ante dato no válido conservar DENY/OFF.
2. En el límite de IPC aceptar datos serializados con parser estricto, tamaño acotado y claves duplicadas rechazadas. En una API JS rechazar primero `Proxy` mediante mecanismo del runtime confiable, y luego prototipo ajeno, accessors, símbolos, claves no enumerables inesperadas y objetos anidados no planos. No ejecutar getters, `toJSON`, `toString`, coerciones o traps.
3. Comprobar exhaustivamente claves propias mediante descriptores, presencia y tipo de todos los campos. Construir una sola instantánea profunda de datos; validar esa misma instantánea y usarla después, sin releer objetos del consumidor. Arrays vacíos deben ser arrays ordinarios sin propiedades extra.
4. Comparar endpoints byte por byte **antes** de usar parser URL o cliente HTTP. No normalizar mayúsculas, espacios, Unicode, octal, hexadecimal, host abreviado, path o puerto con ceros. Rechazar el rol cruzado aunque sea otra URL permitida.
5. Medir en supervisor artefactos, filesystem, entorno y política real; ligar sus identidades a la concesión y comprobar su vigencia al uso. El consumidor no puede escribirlos entre chequeo y uso. Cambio de proceso/inode/namespace/época exige revocación.
6. Autorizar la operación exacta; el broker forma ruta/headers/cuerpo de constantes revisadas, comprueba peer efectivo IPv4 y no acepta override Host, CONNECT, Upgrade, batch RPC o parámetros extra. No permite uso de sockets preexistentes ajenos a la sesión.
7. Recibir dentro de límites; cualquier 30x, error de esquema/protobuf, identidad distinta, timeout o lectura incompleta cierra conexión y suspende. No reenviar credenciales a otro destino ni reintentar.

Estos pasos describen lo que deberá implementarse. Congelar un objeto no elimina efectos de getters ni hace segura una función inyectada: por eso se rechazan antes de copiar y se evita exponer transporte.

## Respuestas permitidas e identidad

RPC: exigir `getblockchaininfo.chain === "regtest"`; `getblockhash(0)` igual al génesis aprobado; `getnetworkinfo` consistente con ABC 0.34.2 y `networkactive=false`; `getpeerinfo` vacío y `getconnectioncount=0`. Las lecturas de versión no sustituyen el hash del binario ni las mediciones de listeners/proceso.

Chronik: decodificar protobuf con esquema fijado; contrastar `/block/0` con RPC y hash esperado. El adaptador documentará si recibe bytes little-endian y convertirá a display-order **una sola vez**; un hash ya display-order no se invierte. `/blockchain-info` debe ser consistente con el nodo fresco aprobado. Si falta información de cadena en Chronik, no inventar un campo `chain`: usar medición de proceso/binario y concordancia de bloque 0. El génesis compartido con otras implementaciones no basta como identidad eCash.

Quedan denegados, entre otros, RPC `addnode`, `setnetworkactive`, `createwallet`, `loadwallet`, `import*`, `sendrawtransaction`, `submitblock`, `generatetoaddress`, `getnewaddress`, `stop` y métodos desconocidos; Chronik POST de transacciones, validación/difusión, batch, WebSocket y rutas no enumeradas. Los negativos se rechazan en el broker **antes de llegar al nodo**, sin construir TX, usar llaves o enviar payload firmado. La suspensión del nodo se realiza por supervisor/PID conocido, no ampliando RPC del consumidor.
