# Suspensión, rollback y conservación de evidencias

**Procedimiento propuesto para una sesión futura autorizada. Ninguna acción operativa se ejecuta ahora.** La única actividad actual es documental y la apertura del PR Draft.

## Condiciones de suspensión

Suspender ante cualquier socket/consulta/intento fuera de política; peer, ruta, interfaz, listener o proceso extra; identidad/génesis/cadena no concordante; valor obligatorio ausente o inválido; transporte directo no autorizado; proxy, redirect, DNS, IPv6 o fallback; cambio de SHA/base/binario/configuración/datadir/política/namespace; secreto en salida; permiso peligroso/flag activado; uso de llave/fondo/TX; cambio productivo; autorización vencida/revocada; límite de tiempo/recurso alcanzado; pérdida de monitoreo o custodia; fallo REG-11B o evidencia no concluyente. No continuar para obtener una corrida verde.

La revisión independiente desfavorable mantiene la fase pendiente; un CI verde no dispensa controles. Si el host ya tenía servicios o datos productivos inesperados en el perímetro, detener preparación futura y pedir decisión sobre el perímetro, sin detener ni modificar esos servicios por inferencia.

## Secuencia de parada futura

1. **Revocar primero.** Supervisor cambia estado a SUSPENDED, incrementa época de revocación, cancela operaciones y cierra IPC/transporte. Objetivo propuesto: ≤1 s para revocación/cierre de transporte; una syscall ya en vuelo se cancela o su respuesta se descarta. Cero nuevas concesiones.
2. **Conservar confinamiento.** Mantener namespace sin salida y política kernel mientras exista cualquier proceso/sesión. No vaciar reglas, publicar puertos o cambiar red para facilitar diagnóstico. Registrar evento mínimo sanitizado de suspensión antes de cualquier reinicio.
3. **Detener únicamente el cgroup/PID/start-time autorizado.** Enviar señal de terminación supervisada a bitcoind/broker/arnés; plazo propuesto 15 s. Si no terminan, matar solo ese cgroup mediante handle de supervisor validado, sin `pkill` por nombre. Cronik termina con bitcoind. No ampliar RPC para llamar `stop` ni tocar servicios ajenos.
4. **Verificar cierre.** Confirmar procesos, sockets/FD y listeners de la sesión ausentes, concesiones inválidas, cero peers y ausencia de rutas/egress. Si falla la observabilidad, conservar aislamiento y marcar cierre no demostrado; escalar al operador, no afirmar recuperación.
5. **Sellar evidencia.** Capturar estados antes/durante/después ya permitidos, tiempos, hashes y razón de suspensión; proteger datadir/logs restantes sin nuevos arranques. No copiar cookies ni volcar memoria completa que contenga auth. Si aparece secreto, revocarlo y poner originales en custodia restringida; solo versión sanitizada fuera de esa custodia.
6. **Informar y esperar decisión nueva.** Operador emite reporte con PR/SHA, causa, impacto observado, incertidumbre y medidas. Fernando decide cualquier diagnóstico adicional, remediación o nueva sesión; no hay retry/restart automático.

Los objetivos temporales son propuestos, pendientes D-07/D-09 y prueba K; no se presentan como garantías ya medidas.

## Rollback futuro

El estado seguro es laboratorio apagado, permisos DENY, flags OFF, concesiones revocadas, cero listeners de laboratorio y evidencia preservada. El diseño no toca producto, por lo que no prevé migraciones inversas de SQLite, reverts de paquetes o reinicios productivos.

Tras comprobar salida de todos los procesos, el operador conserva el datadir **de la sesión** como evidencia restringida según política aprobada; no ejecuta `rm -rf`, reindex, wipe, rescan o reutilización automática. Cookies efímeras se invalidan con cierre de sesión y se excluyen de artefactos publicables; una sesión nueva nunca hereda cookie/FD/concesión. La limpieza definitiva del datadir y evidencia requiere política de retención y aprobación aplicables.

Solo después del cierre y sellado se liberan recursos efímeros de la sesión: namespace, cgroups y montajes exclusivamente creados para ella. No retirar controles mientras quede proceso vivo. No restaurar firewall global porque este diseño prohíbe modificarlo; si una implementación futura necesitara modificar el host, sería cambio de alcance sujeto a nueva orden antes de hacerlo.

Si se detectara una modificación productiva inesperada, suspender, preservar diff/metadata sanitizados y pedir un plan de recuperación específico; no hacer `git reset`, rollback de bases de datos o cambios de servicios ajenos sin orden. La preparación documental actual se revierte, si se solicita, mediante cierre del Draft o un commit documental explícito, conservando el historial de revisión.

## Expediente de ejecución futuro

| Artefacto | Contenido y justificación |
| --- | --- |
| `authorization` | Acta/orden, PR/base/head SHA completos, alcance/fecha/expiración y responsables. Evita permiso implícito o para otro commit. |
| `artifacts` | Versiones y SHA-256 de binario, librerías, broker, decoder, arnés, contrato y política; cadena de procedencia release. Distingue fuente Git de ejecutable real. |
| `preflight` | UID/GID/PID/start-time/cgroup, namespaces, interfaces/rutas, montajes/componentes/inodes/modos, configuración efectiva sin auth, entorno por nombres aprobados. Prueba el estado real frente al declarado. |
| `runtime` | Listeners/eventos bind/connect, peers, respuestas diagnósticas permitidas, contadores de denegación y captura sin payload/credencial; correlación de sesión. Permite evaluar aislamiento continuo. |
| `cases` | Cada E-01–E-26, entradas/salidas sanitizadas, esperado/observado, resultado, tiempos y límite del método; conservar fallos y repeticiones. Evita seleccionar solo éxitos. |
| `closure` | Causa/secuencia de parada, verificación sin procesos/listeners, concesiones inválidas y recursos retenidos/liberados. Prueba rollback y límites. |
| `review` | Identidad e independencia del revisor, método, SHA exacto, hallazgos/limitaciones y decisiones de Fernando. Autor del parche no cuenta como su revisor independiente. |
| `manifest` | Ruta/tamaño/SHA-256 de cada artefacto sanitizado, hash del manifiesto fuera de él y registro de custodia. Detecta alteraciones; no acredita por sí solo autenticidad del contenido. |

Identificador de sesión propuesto: fecha UTC + nonce sin datos personales; correlación adicional con hora America/Mexico_City. El custodio registra cada acceso/copia, origen/destino, hora, responsable y hashes antes/después; almacenamiento fuera del datadir de nodo y fuera de montajes de workloads. Originales sensibles, si accidentalmente existen, en repositorio restringido sin publicación; evidencia revisable solo sanitizada, con derivación y hashes diferenciados. No almacenar semillas, llaves privadas, payloads firmados o fondos como evidencia.

Retención propuesta: al menos 180 días y hasta cierre de hallazgos/incidentes, lo que resulte mayor; destino, ACL, custodio y eliminación definitiva pendientes D-09. No confundir hash con firma ni inventar certificación criptográfica.

## Evidencia de esta preparación

`sources.json` congela cuerpos de actas/comentarios y sus metadatos tal como se leyeron; no congela GitHub entero ni autentica a sus autores. `manifest.json` contiene hashes de los documentos de esta propuesta, excluyéndose a sí mismo para evitar circularidad; el SHA del commit del PR y su solicitud de revisión fijan el conjunto completo. Una edición posterior exige regenerar hashes y solicitar revisión del nuevo SHA.

No se adjuntan trazas de nodo, capturas de red, tabla real de listeners/peers o resultados REG-11B porque no se produjeron. El dictamen original de Tepoztli y sus sondas no se sustituyen por la transcripción de las actas; la limitación queda identificada en D-10.
