# Arquitectura de aislamiento propuesta

**Diseño no instalado. No ejecutar estos ajustes.** Todos los controles C-* son requisitos para un futuro PR de implementación y deben vincularse a evidencia REG-11B antes de aceptar su salida.

## Topología y fronteras de confianza

Bitcoin ABC **0.34.2** contiene Chronik en el mismo proceso. No se propone otro nodo, NNG, explorador externo, proxy inverso ni servicio de producción. El [README upstream congelado](https://github.com/Bitcoin-ABC/bitcoin-abc/blob/d6674af70e312595297e0bc2a3c08fc09d91d044/chronik/README.md) explica esta integración. La siguiente es una topología propuesta, no una descripción del host actual.

```text
Host: supervisor/custodio (control por IPC local, sin relay TCP)
  └─ namespaces dedicados: red + mount + PID + IPC + UTS
       Red: únicamente lo; sin veth, bridge, NAT, gateway o NIC externa
       ├─ consumidor de laboratorio (UID/cgroup propio; sin sockets IP)
       │    └─ IPC Unix autenticado, operaciones enumeradas
       ├─ broker confiable (UID/cgroup propio; transporte fijo)
       │    ├─ TCP IPv4 → 127.0.0.1:19443 RPC
       │    └─ TCP IPv4 → 127.0.0.1:19442 Chronik HTTP
       └─ bitcoind + Chronik (UID/cgroup propio)
            ├─ listener RPC 127.0.0.1:19443
            ├─ listener Chronik 127.0.0.1:19442
            └─ sin peers, sin connect saliente, sin wallet
```

Los tres procesos comparten **el mismo namespace de red**: loopback de namespaces distintos no comunica. El host no publica esos puertos; su propio `127.0.0.1` es otro espacio. Las respuestas del nodo al broker son tráfico de conexiones permitidas; no son permiso para nuevas conexiones del nodo. La política diferencia `connect` nuevo de respuestas. Un simple bloqueo total de OUTPUT rompería también las respuestas y no satisface el diseño.

El supervisor inicia confinado, observa y revoca. El consumidor no puede entrar al namespace del host, acceder a cookies, abrir sockets IP o crear procesos de escape. Broker y nodo no pueden cambiar namespace/política ni escribir sus ejecutables/configuración. El broker y el supervisor son parte de la base confiable: sus hashes y políticas se revisan; campos declarativos de un adaptador no prueban su conducta.

## Configuración propuesta, solo como datos para revisión

Las dos URL completas heredadas de S1-A son `http://127.0.0.1:19443` (RPC) y `http://127.0.0.1:19442` (Chronik). Los puertos estaban en una allowlist **offline**, no abiertos ni autorizados para uso vivo. D-05 debe ratificar su uso y namespace antes de cualquier arranque. No se permite fallback a puertos por defecto, comodines o IPv6.

La configuración futura tendrá un solo archivo absoluto, de solo lectura para el nodo, y argv generado por supervisor desde un manifiesto aprobado. No se entrega aquí un `bitcoin.conf` utilizable. Se inspeccionarán precedencia, duplicados y secciones de red: el generador colocará las opciones restringidas a red en `[regtest]` según ABC y rechazará cualquier override contradictorio.

| Ámbito | Ajuste requerido | Justificación y evidencia |
| --- | --- | --- |
| Selección/arranque | `chain=regtest`, `server=1`, `daemon=0`; `conf` absoluto aprobado y argumento negativo `-nosettings`. | Evitar cadena por defecto, configuración dinámica o daemon fuera de supervisión; REG-11B-08/24. |
| Identidad filesystem | Ejecutable absoluto `/home/xolosarmy/bitcoin-abc-0.34.2/bin/bitcoind`; datadir absoluto `/home/xolosarmy/xolosarmy-regtest/data`. | Conservar cadenas revisadas sin confundirlas con identidad del archivo; C-02 mide y fija objetos. Datos de cadena en `data/regtest/`, no `.bitcoin`. |
| RPC | `rpcbind=127.0.0.1:19443`, `rpcport=19443`, `rpcallowip=127.0.0.1/32`; una sola aparición de cada uno. | El código [HTTPBindAddresses](https://github.com/Bitcoin-ABC/bitcoin-abc/blob/d6674af70e312595297e0bc2a3c08fc09d91d044/src/httpserver.cpp) exige **rpcallowip y rpcbind** para usar binds explícitos; omitir uno puede dejar binds por defecto. Verificar tabla real, no solo archivo. |
| Auth RPC | Cookie efímera local de laboratorio, modo `0600`, solo nodo/broker mediante montaje de archivo restringido; consumidor sin acceso. | Evitar RPC anónimo y exposición de credencial. No es llave de fondos; en este encargo no se crea ni se lee. No URL userinfo, argv, repositorio o logs. D-06 define ACL final. |
| Chronik | `chronik=1`, una única `chronikbind=127.0.0.1:19442`; mantener token index en su default, sin reindex ni wipe. | No heredar binds. Chronik no ofrece autenticación propia según README: aislamiento SO y broker son obligatorios. No se evalúa ALP ni se demuestra settlement. |
| P2P | `networkactive=0`, `listen=0`, `connect=0`, `maxconnections=0`. | Capas de defensa; `connect=0` representa la forma negativa `-noconnect` de ArgsManager, no un peer literal. P2P desactivado no sustituye bloqueo SO; no configurar `bind` P2P ni un puerto P2P nuevo. |
| DNS/seeds | `dns=0`, `dnsseed=0`, `fixedseeds=0`, `forcednsseed=0`. | Evitar descubrimiento; cero `addnode`, `seednode`, `externalip`, `overridednsseed`. Ningún nombre llega al transporte. |
| Otros caminos de red | `discover=0`, `listenonion=0`, `onion=0`, `proxy=0`, `natpmp=0`, `i2pacceptincoming=0`. | Desactivar descubrimiento y proxies; ausentes `i2psam`, `torcontrol`, `whitebind`, `whitelist`. El SO bloquea además IPv6, UDP y raw sockets. |
| Superficies adicionales | `rest=0`, `avalanche=0`; ninguna opción ZMQ, Electrum bind, plugin ni notificación por comando. `chronikelectrumpeersvalidationinterval=0`. | Evitar listeners, descubrimiento Electrum, ejecución por hooks o actividad indirecta; validar opciones efectivas contra el fuente fijado, sin aceptar opciones desconocidas. |
| Wallet/mempool | `disablewallet=1`, `walletbroadcast=0`, `persistmempool=0`; no `wallet`, `loadblock` o bootstrap importado. | Ninguna cartera, llave, transacción ni mempool histórico; datos nuevos solo tras D-04, sin minado ni generación de bloques. |

Los flags y su semántica se contrastan con [init.cpp de R-08](https://github.com/Bitcoin-ABC/bitcoin-abc/blob/d6674af70e312595297e0bc2a3c08fc09d91d044/src/init.cpp), [Chronik C++ de R-08](https://github.com/Bitcoin-ABC/bitcoin-abc/blob/d6674af70e312595297e0bc2a3c08fc09d91d044/chronik/chronik-cpp/chronik.cpp) y el [manual 0.34.2](https://www.bitcoinabc.org/doc/0.34.2/man/bitcoind/). Son restricciones de diseño: el generador y su representación exacta de opciones negativas deben revisarse y probarse en un futuro PR; ninguna incompatibilidad habilita omitir un control. Si una opción no existe en el artefacto aprobado o no tiene el efecto esperado, se suspende.

## Controles exigibles del SO y transporte

| ID | Control propuesto | Motivo y criterio verificable |
| --- | --- | --- |
| C-01 | Namespace de red nuevo sin interfaces salvo `lo`, sin rutas exteriores, sin veth/NAT/port publishing, sin host networking. | Loopback solo no impide salida a Internet en un host normal. Registrar inode del namespace, interfaces y rutas IPv4/IPv6; REG-11B-09/10. |
| C-02 | Mount namespace con binarios/librerías/config readonly, datadir exclusivo `0700`, `umask 077`, logs limitados; `lstat` de todos los componentes y apertura sin seguir links. Congelar montajes y directorios contra renombrado. | Prevenir symlink/TOCTOU y acceso a `.bitcoin`, Wallet, SSH, cloud credentials, SQLite/Core o repo productivo. No montar home completo, Docker socket, bus de servicios ni `/proc` del host; REG-11B-08/17/24. |
| C-03 | UID/GID distintos para nodo, broker y consumidor; sin privilegios, capabilities vacías, `no_new_privs`, seccomp/LSM revisado; negar setns/unshare/mount/ptrace y acceso a PID ajeno. | Impedir modificar política, inspeccionar cookie o escapar. No se propone root en workloads. El supervisor privilegiado solo prepara/revoca y deja privilegios fuera; REG-11B-17/20. |
| C-04 | Política kernel de denegación por defecto, instalada **dentro** del namespace futuro antes del nodo; control por cgroup/UID y hook `connect`/`bind` o backend equivalente probado. | Broker: solo nuevas conexiones TCP IPv4 a los dos destinos exactos; nodo: cero conexiones nuevas salientes y bind solo a los dos sockets previstos; consumidor: ninguna conexión IP. Solo respuestas stateful y puertos efímeros asociados; ningún listener adicional. No cambiar firewall global; REG-11B-10/11/20. |
| C-05 | Rechazar DNS en aplicación, bloquear sockets DNS UDP/TCP, AF_INET6/AF_PACKET/raw y resolución NSS que abra red; `resolv.conf` aislado sin resolver. | Un DNS ausente en archivo no demuestra ausencia de consultas; observar syscalls/contadores sin consultar un resolver real. No aceptar localhost, IDNA, IPv4 abreviada, mapeada o equivalente; REG-11B-06/13. |
| C-06 | Entorno real reconstruido por allowlist mínima; no heredar `process.env`, agentes de proxy, configuración de usuario o hooks de carga. | Rechazar variables de proxy de cualquier caso (incluido NO_PROXY), `NODE_OPTIONS`, `LD_PRELOAD`, `LD_LIBRARY_PATH` no aprobado y configuraciones npm/curl. Un `env:{}` declarado no prueba el entorno del proceso; REG-11B-07/24. |
| C-07 | Broker controla destino, Host, método, ruta, cuerpo y headers; HTTP sin 30x, CONNECT, Upgrade/WebSocket, retries, discovery, fallback o pool externo. | Un peer loopback malicioso o una respuesta puede desviar al cliente. Cerrar transporte en 30x incluso con Location al mismo destino; no seguirlo; REG-11B-12/15/16/19. |
| C-08 | Supervisor mide sockets/PID/cgroup/namespace, conexiones, configuración y contadores durante toda sesión; no basta una captura inicial. | Detectar cambios de identidad, listeners fugaces, pérdida de política u observabilidad; revocar ante cualquier desviación. Captura de red sin payload/auth y monitor independiente; REG-11B-09/11/23/25. |
| C-09 | Límites de tiempo/CPU/RAM/disco y proceso en foreground sin restart automático. | Evitar expansión de recursos y reinicio con estado inseguro. Valores D-07; cualquier límite alcanzado suspende; REG-11B-19/23. |
| C-10 | Nodo y broker solo aceptan artefactos del manifiesto fijado, incluido SHA-256 del ejecutable, política y decoder; configuración inmutable por sesión. | La cadena de versión por sí sola puede falsificarse. Rechazar drift y exigir orden nueva; REG-11B-08/24. |

No se presume que una lista nftables, un seccomp genérico o un contenedor estándar implemente C-04. D-02 debe concretar backend y prueba; la ausencia de soporte del kernel es bloqueo, no excepción. Los controles se validan primero en sandbox sacrificial sin nodo y sin rutas exteriores; no se realizan cambios o pruebas en este encargo.

## Identidad de cadena

Génesis **candidato** de ABC 0.34.2 regtest: `0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206`, tomado de [CRegTestParams](https://github.com/Bitcoin-ABC/bitcoin-abc/blob/d6674af70e312595297e0bc2a3c08fc09d91d044/src/kernel/chainparams.cpp), no de un nodo consultado. D-05 debe adoptarlo expresamente. No identifica por sí solo una implementación eCash: se combina con hash/procedencia del binario, `chain=regtest`, versión, PID/namespace y coincidencia RPC/Chronik del bloque 0.

Antes de lecturas generales solo se propone un bootstrap de identidad expresamente autorizado y con métodos mínimos (contrato H-1). No hay génesis aprendido del endpoint y aceptado como expectativa. Si faltan datos, RPC y Chronik discrepan o hay error de endian, se revoca sin fallback. No usar peers/minado para resolver discrepancias.
