#  Sistema de Control de Matrículas y Pensiones - Academia Plus Twenty

Aplicativo web para la **Academia Preuniversitaria Plus Twenty** (Trujillo, Perú 2026), diseñado para agilizar el registro de matrículas y brindar trazabilidad confiable de los pagos de pensiones. El sistema cuenta con evaluación de usabilidad basada en la norma **ISO 9241-11** y el instrumento **System Usability Scale (SUS)**.

---

##  Quién hace qué (Equipo y Roles)
* **Villanueva Meregildo, Juan David** (`CyberSecurity28`): Líder del proyecto y desarrollo de interfaces de usuario
* **Morales Yupanqui, Luis Antonio** (`luis67961`): Arquitectura Backend, persistencia Spring Data JPA y gestión del repositorio Git
* **Carranza Pacheco, Felipe Alejandro** (`carranzapacheco`): Analista de requerimientos, reglas del negocio y validación de formatos
* **González Alava, Anthony Josue** (`agonzaleza`): Diseñador UX/UI y diseño del módulo de listados tabulares
* **Ventura Guzman, David Alonso** (`davidventuraguzman`): Desarrollador Backend, base de datos MySQL y soporte de documentación

---

##  Stack Tecnológico
* **Lenguaje:** Java 17
* **Framework:** Spring Boot 3.3.5 (Spring MVC, Spring Data JPA)
* **Base de Datos:** MySQL
* **Frontend:** HTML5, CSS3, JavaScript modular nativo
* **Gestor de Compilación:** Apache Maven (`mvnw`)
* **Control de Versiones y Gestión:** Git, GitHub Projects, GitHub Releases

---

##  Cómo instalar

### 1. Requisitos Previos
* Java JDK 17 o superior instalado y configurado en las variables de entorno (`PATH`).
* Servidor MySQL activo (puerto estándar `3306`).
* Git instalado en el equipo.
* ### 2. Configuración de Base de Datos
1. Inicie su gestor de base de datos MySQL (MySQL Workbench o consola).
2. Ejecute el script de estructura inicial ubicado en el repositorio:
   ```bash
  database/crear_bd.sql
   
Verifique las credenciales de conexión en src/main/resources/application.properties:
Properties
spring.datasource.url=jdbc:mysql://localhost:3306/plustwenty4?createDatabaseIfNotExist=true
spring.datasource.username=root
spring.datasource.password=tu_contraseña
 Cómo ejecutar
1. Clonar el Repositorio
Bash
git clone [https://github.com/luis67961/Academia_Plus.git](https://github.com/luis67961/Academia_Plus.git)
cd Academia_Plus
2. Compilar el Proyecto
PowerShell
.\mvnw.cmd clean compile
3. Iniciar el Servidor Spring Boot
PowerShell
.\mvnw.cmd spring-boot:run
4. Acceder al Aplicativo Web
Una vez que el servidor Tomcat arranque en el puerto configurado (8084), acceda en su navegador web a:

Portal Institucional y Login: http://localhost:8084/PLUSTWENTY/index.html

Panel de Gestión Administrativa: http://localhost:8084/PLUSTWENTY/admin.html

Portal de Autoservicio para Padres y Alumnos: http://localhost:8084/PLUSTWENTY/usuario.html
