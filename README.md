# Plus Twenty — Demo empresarial

Demo local de matrículas y pensiones para Matemática, Oratoria, Locución y Podcast.

## Iniciar

Requiere Java 21. Desde la raíz del proyecto:

```powershell
.\mvnw.cmd spring-boot:run
```

Abrir http://127.0.0.1:8080/login. El servidor está limitado a esta computadora.
La primera ejecución con Maven necesita acceso a internet para sus dependencias.
Los estilos y el logo están incluidos; las pantallas no dependen de CDN.

Para preparar un ejecutable antes de la presentación:

```powershell
.\mvnw.cmd clean package
java -jar target/plus-twenty-academic-0.0.1-SNAPSHOT.jar
```

Ejecutar siempre desde la misma carpeta del proyecto para usar la misma base local.
No ejecutar dos instancias a la vez sobre la misma base.

## Accesos de demostración

Las cuentas de acceso se entregan en `CREDENCIALES.md`, un archivo local excluido de Git y de las pantallas de la aplicación.

Las cuentas de familia están vinculadas exclusivamente a María Fernández Quispe, DNI ficticio 72834912. No hay todavía administración de usuarios ni vinculación configurable de apoderados. Las credenciales son públicas de demostración; no usar estas cuentas para un despliegue real.

## Recorrido para presentar (5–8 minutos)

1. Ingresar como administrador y mostrar el panel con matrículas, cobros y deuda vencida.
2. Abrir Cursos y grupos. Mostrar las cuatro ofertas, sus contenidos y horarios de ejemplo. Se pueden registrar nuevos grupos con una cantidad de cuotas y una pensión.
3. Registrar una matrícula: seleccionar curso y grupo, DNI ficticio, nombre, turno y fecha. La aplicación genera el cronograma automáticamente según la tarifa del grupo.
4. Abrir Pensiones y pagos y seleccionar al estudiante. Mostrar montos, vencimientos y saldos.
5. Registrar un abono de S/ 100 sobre una cuota de S/ 350: el saldo queda en S/ 250 y el estado cambia a PARCIAL. Completar el saldo para mostrar PAGADA. Yape, Plin y transferencia requieren número de operación.
6. Mostrar el historial y el número de constancia interna. Los pagos son registros manuales; no se realizan transacciones bancarias ni se verifican operaciones con proveedores.
7. Cerrar sesión e ingresar como padre o estudiante para consultar el curso, horario, cuotas y pagos de María.
8. Mostrar que los datos se conservan después de reiniciar.

Los contenidos, grupos, horarios, precios y estudiantes iniciales son ficticios y deben ajustarse a la oferta real de la academia. Hay un estudiante adicional llamado Alejandro Mendoza Torres usado para verificar el flujo de Podcast.

## Persistencia

Los datos se guardan en `data/academia.mv.db`. El archivo está excluido de Git.
Para respaldar, cerrar la aplicación y copiar la carpeta `data` completa.
Los ejemplos se cargan solo cuando no hay matrículas; reiniciar no borra registros.
Las pruebas usan bases en memoria separadas y no modifican el demo.

## Alcance y límites

- Administración de matrículas, registro de cursos/grupos, cronogramas y cobros manuales.
- Pagos parciales, deuda vencida, validación de saldo e historial conservado.
- Una matrícula con cuotas no se elimina: se da de baja para conservar el historial.
- Un estudiante puede matricularse en distintos cursos/grupos; se impide duplicar su DNI dentro del mismo grupo.
- Acceso con roles y protección CSRF. Las familias no pueden abrir las funciones administrativas.
- Portal familiar de demostración con una matrícula vinculada fija; falta el modelo completo de estudiantes, apoderados y usuarios para operación real.
- El contenido del curso se registra como descripción; no hay aún catálogo independiente de sesiones/docentes, cupos, asistencia ni control de choques de horario.
- No incluye pasarela de pago, facturación tributaria, emisión de comprobantes fiscales, carga de vouchers, notificaciones, descuentos ni anulaciones/reversiones de pagos.
- Las constancias son referencias internas en el historial; aún no hay descarga PDF.
- Los vencimientos se generan al cierre del mes de matrícula y los meses siguientes. Los cambios posteriores de fecha/estado no recalculan deudas.
- Antes de producción: cuentas propias, vinculación real de familias, políticas de cobranza, respaldo, despliegue y revisión de seguridad.

## Validación

```powershell
.\mvnw.cmd test
```

Las pruebas cubren generación de cuotas, abonos parciales, cancelación, rechazo de sobrepagos y valores inválidos, autenticación, permisos por rol, CSRF y renderizado de las pantallas principales.
