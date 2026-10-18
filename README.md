# Plus Twenty — Gestión académica local

Aplicación Spring Boot para cursos, solicitudes de matrícula, estudiantes, asistencia y cobranza. Incluye portal privado de estudiantes y apoderados. Por ahora funciona en esta computadora; no se ha realizado despliegue en la nube.

## Iniciar

Requiere Java 21. Desde la raíz del proyecto:

```powershell
.\mvnw.cmd spring-boot:run
```

- Cursos e inscripciones: http://127.0.0.1:8080/cursos
- Acceso: http://127.0.0.1:8080/login
- Las cuentas de demostración están documentadas en `CREDENCIALES.md` (excluido de Git).

Para preparar el ejecutable:

```powershell
.\mvnw.cmd clean package
java -jar target/plus-twenty-academic-0.0.1-SNAPSHOT.jar
```

## Funciones disponibles

- Inscripción en tres pasos con validación, creación de cuenta y seguimiento de solicitud. Sin JavaScript, el formulario completo sigue disponible.
- Portal con saldo, próxima cuota pendiente, cursos, horarios, solicitudes, asistencia y pagos de la cuenta.
- Perfil para nombre, teléfono y correo opcional; cambio de contraseña verificando la actual y cerrando la sesión actual.
- Solicitudes con búsqueda, corrección de datos, confirmación, rechazo y cancelación con motivo. El solicitante solo consulta y corrige las propias mientras estén pendientes.
- Fichas por DNI con responsable de contacto, parentesco, teléfono, observaciones, matrículas e historial de pagos.
- Vinculación explícita de matrículas anteriores a una cuenta existente, con verificación de identidad por administración. No se transfiere una matrícula ya vinculada a otro titular.
- Cursos y grupos configurables: nombre libre, docente, horario, turno, capacidad, tarifa, número de cuotas e inscripciones abiertas o cerradas. Los cupos cuentan matrículas activas; una solicitud no reserva vacante.
- Asistencia por grupo y fecha: presente, falta, tardanza o justificada. Puede corregirse sin duplicar el registro. No admite fechas futuras.
- Cronograma, abonos parciales, historial, filtros y prevención de operaciones bancarias duplicadas por medio y referencia.
- Carga de comprobantes PNG, JPG o PDF de hasta 5 MB. Su aprobación administrativa registra el pago; el rechazo conserva el saldo y muestra el motivo.
- Constancia interna descargable en HTML, con opción de imprimir o guardar como PDF desde el navegador. No es un comprobante tributario.
- Menú móvil con foco y cierre por Escape, salto al contenido, formularios etiquetados, mensajes persistentes, confirmaciones y tablas adaptadas a celular.

El recorrido de revisión está en [docs/GUIA_FUNCIONAL.md](docs/GUIA_FUNCIONAL.md).

## Datos y demostración

La base H2 se guarda en `data/academia.mv.db` y está excluida de Git. Cuentas, contraseñas con hash BCrypt, solicitudes, fichas, asistencia y comprobantes persisten al reiniciar. Los adjuntos se guardan en la base y no se publican como archivos estáticos. Para respaldar, cerrar la aplicación y copiar la carpeta `data` completa. Ejecutar siempre desde esta misma carpeta y no abrir dos instancias sobre la misma base.

Los ejemplos iniciales y cuentas `admin`, `padre` y `estudiante` son de demostración. Los dos accesos familiares conservan el alumno ficticio María Fernández Quispe mientras su matrícula no se vincule a otra cuenta. Las nuevas cuentas no reciben acceso por coincidencia de DNI. No usar las cuentas y claves conocidas de demostración para operación real.

## Validación

```powershell
.\mvnw.cmd test
node --check src/main/resources/static/js/interfaz.js
```

Las pruebas usan bases en memoria separadas. Cubren acceso por roles y CSRF, aislamiento entre cuentas, cambio de contraseña, solicitud y confirmación única, cupos, cierres con motivo, asistencia, vinculación de matrículas, pagos parciales, carga HTTP multipart, aprobación de comprobantes y descargas privadas de archivos y constancias. No modifican la base local de demostración.

## Límites de esta versión

- Un responsable de contacto principal por ficha y una cuenta titular por matrícula; no incluye múltiples apoderados con permisos independientes.
- No hay recuperación de contraseña por correo, gestión de bajas de usuarios ni notificaciones automáticas. Editar el correo no lo verifica.
- El turno debe corresponder al grupo; el horario es descriptivo y todavía no se comprueban cruces de horario o calendarios de sesiones.
- No incluye pagos automáticos, verificación bancaria, facturación tributaria, descuentos ni anulaciones/reversiones de abonos. Administración verifica los comprobantes fuera de la aplicación antes de aprobarlos.
- Los comprobantes solo se descargan con permiso; no hay vista previa ni análisis antivirus. La firma de archivo y el tamaño se validan al subir.
- Los vencimientos siguen el cierre del mes de matrícula y meses siguientes. Cambiar la fecha no recalcula cuotas existentes; cambiar la tarifa de un grupo no altera sus cronogramas anteriores.
- La mejora de accesibilidad tiene revisión manual en escritorio y a 390 px; no constituye una certificación WCAG ni una auditoría con lectores de pantalla.
- El proyecto conserva configuración y datos de demo local. Servidor, dominio, base de nube, respaldos operativos y endurecimiento para producción se trabajan en otra etapa.

## Trabajo en equipo

Los cambios se desarrollan y guardan en `dVenturag`. Se abre un pull request hacia `main` para comentarios y aprobación de los compañeros; no se fusiona automáticamente.
