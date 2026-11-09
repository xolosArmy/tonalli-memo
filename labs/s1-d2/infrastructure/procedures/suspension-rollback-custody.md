# Suspensión, rollback y custodia — etapa 1 offline

Alcance: la rama `lab/s1-b-stage1-offline-20261109` bajo la Octava Acta `#6744011208`. Este procedimiento no designa operador de nodo, custodio de sesión viva ni supervisor de REG-11B. D-09 sigue sin designar. No autoriza tocar el host, el datadir ni servicios productivos.

## Cuándo suspender

Detener el encargo de inmediato si ocurre cualquiera de estas desviaciones:

- Cambia el SHA de S1-A `7d5b91283085871565e784c717ddc14b6736af46`, el diseño `a0257480cf9c12f8ee8df71408f276f42b8ee463` o la base `228d1f036643ca9be8ba85e91f8200536f3242da`, o `main` ya no es esa base.
- Cambia el blob de alguno de los nueve archivos históricos de S1-A o del subárbol `labs/s1-d2/s1-b-proposal/`.
- Aparece un archivo fuera de `labs/s1-d2/infrastructure/` que esta etapa no haya importado en su commit documental.
- Se ejecuta un script de `scripts/`, se abre un socket, se aplica un namespace, un firewall, un cgroup o una plantilla, o se invoca Bitcoin ABC, Chronik o RPC.
- La publicación del PR dispararía CI incompatible y no hay una decisión nueva que la autorice.
- Falta un control obligatorio o un resultado se presenta como hecho sin haber corrido.

## Qué hacer

1. No seguir editando para obtener un resultado verde.
2. No ampliar permisos, no hacer merge y no marcar el PR como ready.
3. No reiniciar servicios, no borrar datadir y no modificar `packages/`, `apps/`, workflows, RFC ni la matriz S0.
4. Conservar el SHA de la rama, el diff y la salida de la suite offline si esa suite sí llegó a correr.
5. Informar a Fernando con la desviación, el SHA y lo que no se ejecutó.

## Rollback de esta etapa

El rollback permitido es de git en esta rama de laboratorio: no publicar, y no reescribir los commits ya citados en el mapa de procedencia. El checkout preexistente de S0 no forma parte de esta rama y no se usa para deshacerla. No hay datadir de laboratorio que revertir porque esta etapa no lo escribe.

## Custodia

La evidencia de esta etapa son los commits de la rama y el manifiesto SHA-256 de `infrastructure/`. No hay secreto, cookie ni llave que custodiar. Quien custodie una sesión viva futura sigue sin designar.
