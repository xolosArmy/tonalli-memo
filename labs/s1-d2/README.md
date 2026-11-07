# Laboratorio S1-A — guardrails offline

Este directorio es un experimento aislado de S1-A. No forma parte del workspace productivo, no se ejecuta desde los paquetes de `packages/` ni de `apps/`, y no autoriza una conexión.

| Pieza | Estado |
| --- | --- |
| S1-A | Autorizado solo para funciones puras y pruebas offline, por la Cuarta Acta `6691530523`. Esta carpeta no certifica la salida de S1-A. |
| S1-B, S1-C, S1-D | No autorizados. |
| D2, D3, D4 | No autorizados. |
| RFC-0001 | PROPOSED — NOT RATIFIED. SHA de referencia `762582248fb183ce3f9c3fc69b22f1ae5242780a`. |
| S0, S0-05, M1.7.4 | OPEN. |
| `M194-INDEXER-PERSIST` | NOT_DEMONSTRATED. |
| SEC-17 | Mitigación productiva pendiente. |
| Social v2 | INACTIVE. |
| Base de la rama | `origin/main` `228d1f036643ca9be8ba85e91f8200536f3242da`. |
| Matriz | PR #41 `b85a6b5b2fd9e4bfd9fb25cc6f52cd1bfd5c1823`, sin cambios. |
| Regtest de referencia | PR #42 `081d75a762889207283ab7d4434030db30c79b41`, sin cambios y sin nodo. |

## Qué comprueba

`guardrails/` clasifica cadenas y objetos. Una configuración solo queda `allowlisted` cuando todos estos valores son exactos, sin reescritura:

- Rol `rpc` y endpoint `http://127.0.0.1:19443`, o rol `chronik` y endpoint `http://127.0.0.1:19442`.
- Cadena `regtest`.
- Datadir `/home/xolosarmy/xolosarmy-regtest/data`.
- Directorio de binario `/home/xolosarmy/bitcoin-abc-0.34.2/bin`.
- `followRedirects: false`, `proxy: null` y `env` vacío.

Ese resultado significa que las cadenas coinciden con la lista futura. No abre un socket, no identifica un nodo y no satisface REG-11B. `127.0.0.1` no se acepta como clase de direcciones: solo esas dos URL completas.

`ALLOWLISTED_OFFLINE` no autoriza una conexión y no aprueba el uso posterior de un adaptador. Solo registra que las cadenas revisadas coinciden con la lista offline y que esta evaluación no abrió un socket.

El rechazo ocurre antes de invocar un adaptador. El pipeline no llama a `connect`, no resuelve DNS y no lee `process.env`. Un adaptador que seguiría redirecciones, usaría proxy o resolvería nombres se rechaza aunque la URL sea la de la lista.

Los campos ausentes del adaptador no constituyen evidencia de seguridad. Si `calls`, `followRedirects`, `maxRedirects`, `proxy`, `resolve` o `lookup` no aparecen, su ausencia no demuestra que un adaptador futuro sea inocuo.

Los permisos `read`, `assemble`, `sign`, `broadcast` y `deploy` nacen denegados. Conceder uno no concede otro. No hay funciones de armado, firma, difusión ni despliegue.

Los permisos y los flags que devuelve `evaluateConfiguration` son valores seguros predeterminados: las cinco capacidades denegadas y los flags de laboratorio apagados. Esa respuesta no verifica permisos externos ni el estado de otro proceso.

Los flags de laboratorio nacen apagados: `socialV2`, `reply`, `reaction`, `tip`, `socialV2Indexing`, `socialV2Read`, `rmzEmpp` y `broadcast`. Una configuración ausente, desconocida, incompleta, malformada o con un flag en `true` falla cerrada y el estado seguro que se devuelve permanece apagado. Estos flags no son los del producto.

## Cómo repetir las pruebas

Desde la raíz de esta rama, sin Chronik, sin RPC y sin nodo:

```bash
node --test labs/s1-d2/guardrails/reg11a.test.mjs
```

Hace falta Node con el ejecutor `node:test`. No instala dependencias y no modifica el lockfile. Una corrida verde es REG-11A, una simulación offline. No es aislamiento real. El CI productivo no ejecuta esta suite: los workflows no forman parte de S1-A. REG-11B no está autorizado y no se ejecuta aquí.

## Códigos de rechazo

La precedencia dentro de una URL no exacta es: carácter prohibido, credenciales, esquema, autoridad vacía, query o fragmento, ruta, IPv6 o IPv4-mapped, puerto productivo, y después la clase del host. Cualquier código distinto de `ALLOWLISTED_OFFLINE` es un rechazo. Los principales son `MALFORMED`, `INCOMPLETE`, `UNKNOWN_FIELD`, `CREDENTIALS`, `SCHEME`, `REDIRECT`, `PROXY`, `PROXY_ENV`, `IPV6`, `IPV4_MAPPED`, `DNS_REBINDING`, `LOCALHOST_ALIAS`, `WILDCARD`, `PUBLIC_ADDRESS`, `PRIVATE_ADDRESS`, `PRODUCTIVE_PORT`, `NORMALIZATION`, `HOST`, `PORT`, `PATH`, `CHAIN`, `DATADIR`, `BINARY`, `ROLE` y `CONNECT_INVOKED`.

## Condiciones de diseño para S1-B

S1-B no está autorizado. La revisión técnica de Tepoztli deja estas condiciones para un acta futura. Este directorio no las implementa.

- **H-1.** El adaptador de S1-B debe exigir campos obligatorios explícitos. Un campo ausente no puede usarse como evidencia de seguridad.
- **H-2.** S1-B no debe aceptar una capacidad `connect` invocable como si su presencia fuera una aprobación para conectar.

## REG-11B, no autorizado

REG-11B no está autorizado y no se ha ejecutado. Estas propiedades quedan fuera de S1-A. Esta suite no las demuestra:

1. Un proceso real no puede abrir un socket hacia un destino que no esté en la allowlist.
2. El RPC vivo responde `chain=regtest` y un acta futura nombra el hash de génesis.
3. Los listeners son exactamente `127.0.0.1:19443` y `127.0.0.1:19442`, con cero pares.
4. El datadir no es un enlace simbólico y su modo es `0700`.
5. La cadena de versión del binario contiene Bitcoin ABC y `0.34.2`.
6. El entorno real del proceso no tiene variables de proxy.
7. Un cliente HTTP futuro no sigue una respuesta 30x. Aquí solo se rechaza el flag y el adaptador simulado.
8. La resolución DNS real no reescribe un nombre. Aquí no se acepta ningún nombre y no hay consulta DNS.
9. No sale tráfico hacia mainnet, testnet ni hacia el puerto productivo `8332`.
10. La cartera del nodo, si una fase posterior la crea, usa solo llaves desechables.

S1-B sigue sin autorización. Una corrida verde de este directorio no la inicia.
