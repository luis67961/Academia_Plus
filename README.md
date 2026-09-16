Control de Matrículas - Academia PlusTwenty
Problema:

El registro de matrículas y pensiones en Plus Twenty se realiza actualmente de forma manual, lo que genera demoras durante el periodo de matrícula y dificulta llevar un control confiable de los pagos. El tiempo exacto de registro y la cantidad de reclamos se medirán como parte del diagnóstico del proceso actual.

Entidad núcleo

Matricula: alumno, dni, curso, turno, fecha, estado

Integrantes y roles:
Villanueva Meregildo, Juan — Vistas Thymeleaf: formulario de registro, listado en tabla, vista de edición, estilos CSS y página de error personalizada.

Morales Yupanqui, Luis — Backend: entidad Matricula, repositorio JPA, configuración de base de datos H2, lógica de registro y gestión de matrículas.

Gonzalez Alaya, Anthony — Funcionalidad de listado: mostrar datos del estudiante y estado, corrección de visualización, documentación del listado.

Carranza Pacheco, Felipe — Campos adicionales y validaciones: DNI y turno en los formularios de registro y edición.

Ventura Guzman, David — Documentación (README) y configuración de base de datos; resolución de conflictos de fusión.

Modelo de ramas

main + una rama personal por integrante

Cómo ejecutar en git bash: 

git clone https://github.com/vDivCode/Academia_Plus.git
cd Academia_Plus
mvn spring-boot:run

Luego abrir en el navegador: http://localhost:8080/matriculas
