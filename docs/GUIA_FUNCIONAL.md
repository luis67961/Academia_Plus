# Guía de revisión funcional

## 1. Inscripción y portal

1. Sin iniciar sesión, abrir `/cursos`. Revisar grupo, horario, tarifa y vacantes.
2. Elegir «Quiero matricularme». Completar curso/estudiante, contacto y cuenta en tres pasos.
3. Intentar continuar con campos vacíos: debe indicarse el campo y mantenerse el paso actual.
4. Volver al paso anterior: los valores escritos se conservan. Enviar una sola solicitud con datos ficticios.
5. Ingresar con la nueva cuenta. Debe verse la solicitud pendiente y saldo cero, sin matrículas ajenas.
6. Abrir el detalle y corregir contacto o datos mientras siga pendiente. Otra cuenta no debe poder abrir esa URL.
7. En «Mi perfil», actualizar contacto. Cambiar la contraseña requiere la actual; al completarlo se cierra la sesión actual.

## 2. Administración y estudiantes

1. Ingresar como administrador. El resumen enlaza a solicitudes pendientes.
2. Buscar por nombre o DNI y abrir el detalle. Corregir grupo/turno si hace falta.
3. Confirmar después de coordinar con el contacto: se crea una matrícula y un cronograma. No debe ser posible confirmarla dos veces.
4. En otra solicitud, probar rechazo o cancelación con motivo. El solicitante debe ver el estado y poder consultar el motivo en el detalle.
5. Abrir «Estudiantes y apoderados», buscar por DNI y guardar la ficha con su contacto principal.
6. Para una matrícula anterior sin cuenta, seleccionar una cuenta existente y marcar la verificación de identidad. Confirmar el acceso solo tras comprobar su titularidad. Una cuenta distinta no puede reemplazar una vinculación ya existente.
7. Editar la matrícula desde el módulo habitual: su cuenta vinculada debe conservarse.

## 3. Cursos y asistencia

1. Crear un curso con nombre distinto de los cuatro iniciales, indicar docente, grupo, turno y capacidad.
2. Editar el grupo y cerrar las inscripciones. No debe admitir solicitudes nuevas ni confirmaciones mientras esté cerrado.
3. Con un grupo de capacidad uno, confirmar una matrícula y comprobar que no quedan vacantes.
4. Cambiar una tarifa: las cuotas existentes deben conservar su monto.
5. Abrir asistencia, elegir grupo y fecha de hoy. Marcar estados y guardar.
6. Volver a la misma fecha y corregir un estado: se actualiza el registro, sin duplicarlo. Una fecha futura no debe guardarse.
7. La cuenta titular puede consultar la asistencia en su portal.

## 4. Comprobantes y constancias

1. Desde el portal de una matrícula confirmada con saldo, elegir «Enviar comprobante».
2. Adjuntar PNG, JPG o PDF de hasta 5 MB y completar monto, medio y operación. No usar datos bancarios reales en la demostración.
3. El saldo no debe cambiar al subir el archivo. La cuenta puede descargar su adjunto; otra cuenta debe recibir 404.
4. Administración revisa el archivo y verifica la recepción del dinero por sus propios medios antes de aprobar.
5. Aprobar: se registra un único pago. Rechazar: se exige motivo y se conserva el saldo. Una segunda revisión no registra otro pago.
6. En el historial abrir la constancia. Descargar el HTML o imprimir/guardar como PDF. Revisar que aclara que no es una boleta o factura.
7. Probar búsqueda y filtros en pensiones. La selección de un estudiante debe mostrar el saldo de ese estudiante.

## 5. Celular y teclado

- Probar a 390 px: formularios en una columna y tablas presentadas como fichas con etiquetas.
- Usar Tab desde el inicio y verificar «Saltar al contenido» y foco visible.
- Abrir menú móvil; el foco pasa al cierre y queda dentro del menú. Escape lo cierra y devuelve el foco al botón.
- Revisar confirmaciones de matrícula, vinculación, comprobantes y pagos.
- Los mensajes importantes permanecen hasta cerrarlos. Las contraseñas no se rellenan al devolver formularios con errores.
- Desactivar JavaScript: la inscripción completa debe seguir disponible; las validaciones del servidor y CSRF siguen aplicándose.

No realizar pruebas con datos personales reales ni dinero real. Estas verificaciones usan el entorno local de demostración.
