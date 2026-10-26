# D07-CONF-04 — Auditoría de compatibilidad histórica TM1 (solo lectura)

**Estado:** herramienta y conjunto inicial de candidatos documentados; **no equivale a ejecución mainnet ni a ratificación TM1 Core v1.0**.

## Inventario de partida

`d07-conf-04-mainnet-candidates.json` enumera tres TXIDs completos publicados el **10 de septiembre de 2026** en
[«Tonalli Memo ya vive en mainnet»](https://magazine.ecash.mx/reportajes/tonalli-memo-mainnet-capa-social-ecash.html):
primer canary TM1, primera ingesta automática y primer Memo + NFT. La noticia es una **fuente editorial de procedencia**, no una prueba criptográfica de confirmación, validez de firma, altura o fecha exacta de emisión de cada TXID.

**No se han inventado TXIDs** y no se incluyen claves, secretos, firmas, broadcast ni accesos a SQLite de producción.

## Ejecución deliberada y sin escrituras

Requiere dependencias del monorepo compiladas: `pnpm install --frozen-lockfile && pnpm typecheck`.
Ejecutar desde la raíz del repositorio con un endpoint **HTTPS de Chronik eCash mainnet** proporcionado por el operador:

```bash
node scripts/d07-conf-04-historical-audit.mjs \
  --chronik-url "$CHRONIK_MAINNET_URL" \
  --txids-file docs/operations/d07-conf-04-mainnet-candidates.json \
  > d07-conf-04-observaciones.json
```

También puede generarse una muestra de candidatos **confirmados** por descubrimiento LOKAD, sin intervención sobre la cadena:

```bash
node scripts/d07-conf-04-historical-audit.mjs \
  --chronik-url "$CHRONIK_MAINNET_URL" \
  --discover --pages 5 --page-size 25 --max-txids 20 \
  --historical-max-height 900000 \
  > d07-conf-04-muestra.json
```

**Importante:** `900000` es únicamente un ejemplo del parámetro; **no es** un bloque histórico de referencia verificado ni un límite que deba adoptarse. Para una cohorte Draft 0.2, determinar mediante evidencia independiente la fecha/altura de corte efectiva e introducirla en `--historical-max-height`. La búsqueda muestrea páginas repartidas desde la más nueva a la más antigua, dentro del presupuesto especificado; **no** es un barrido exhaustivo de toda la cadena ni una muestra aleatoria representativa.

El programa imprime JSON por stdout (incluye la procedencia declarada, el tip de muestreo, los resultados y sus límites), no escribe archivos directamente. La red solo se consulta al invocarlo deliberadamente; no hay consultas mainnet automáticas en CI.

## Procedimiento y categorías

- `STRUCTURALLY_COMPATIBLE`: TXID confirmado consultado en Chronik y resultado `VERIFIED_TM1` bajo el **verificador del repositorio**, con modelo `trusted-chronik`.
- `REVIEW_REQUIRED`: el verificador devolvió un estado distinto de `VERIFIED_TM1`; documentar `verificationStatus` y `protocolErrorCode` cuando corresponda. **No** convertir de forma automática ese resultado en «mensaje históricamente ilegítimo»: investigar cambios de política o estado de cadena.
- `NOT_CONFIRMED`, `SOURCE_ERROR`, `SOURCE_MISMATCH`, `OUTSIDE_COHORT`: **no concluyentes** para compatibilidad histórica; nunca contarlos como éxitos.
- `SAMPLE_COMPATIBLE_NOT_RATIFICATION`: todos los TXIDs de **esa muestra** resultaron `STRUCTURALLY_COMPATIBLE`; no afirma universalidad, completitud de la cohorte, firmas revalidadas localmente o adopción formal de v1.0.

Los errores por conexión o endpoint se conservan como diagnósticos separados. El proceso devuelve exit code `2` si la muestra tiene incompatibilidades o casos no concluyentes, `1` ante error del programa/descubrimiento, y `0` solo cuando la **muestra delimitada** pasa.

## Pruebas automatizadas

```bash
node --test scripts/d07-conf-04-historical-audit.test.mjs
```

Estas pruebas se incluyen en `pnpm test`/CI, con fuentes **simuladas**, y cubren: validación del manifiesto, límites, muestreo, estabilidad del tip, tipología de fallos de consulta, incompatibilidad de autoría, falta de confirmación y diferencia entre muestra aprobada y ratificación.

## Puertas de evidencia pendientes

1. Ejecutar contra **al menos un endpoint real mainnet verificable** y archivar reporte JSON firmado/identificado por URL de origen, fecha, commit del verificador, total de muestras y altura/hash del tip.
2. Evaluar TXIDs reales identificados como anteriores a la revisión de Draft 0.2, si los hay, con procedencia/cronología reproducibles. Una noticia publicada en septiembre no resuelve la contradicción histórica del requisito 11.6 de la especificación Draft 0.2.
3. Resolver diferencias entre política de aplicación (TM0+TM1, sighash, P2PKH) y aceptación normativa del wire TM1 antes de imponer rechazos retroactivos.
4. Reconciliar requisitos restantes de `docs/operations/D-07-acta-conciliacion-normativa.md` (PR #31) y obtener **ratificación humana expresa en otro PR**. El control de resiliencia D07-CONF-03, PR #35, también debe registrarse de forma separada en el acta.
