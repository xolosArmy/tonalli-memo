# Plantillas no aplicadas

`bitcoin-abc-0.34.2-chronik.regtest.conf.template` no es `bitcoin.conf`. No se copia al datadir, no se pasa a un proceso y no contiene credenciales.

Los valores `rpcbind=127.0.0.1:19443` y `chronikbind=127.0.0.1:19442` son candidatos heredados de la allowlist offline. No son permiso de conexión. No hay línea `bind=` de P2P.

El backend de aislamiento, el SHA-256 del ejecutable, la medición del datadir, el uso vivo de los endpoints y el broker quedan como `PENDING_D-02` a `PENDING_D-06`.
