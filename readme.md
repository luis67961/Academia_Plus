# PLUSTWENTY · Spring Boot + MySQL

Sistema de matrículas y pensiones de la academia PLUSTWENTY. El frontend (HTML + JavaScript + Tailwind)
es el mismo del prototipo; ahora los datos viven en **MySQL** y el acceso lo controla un backend **Spring Boot**.

## Requisitos
- JDK 17 o superior
- Maven 3.9+ (o el Maven de tu IDE: IntelliJ / Eclipse / STS)
- MySQL 8 en `localhost:3306` y conexión a internet (Tailwind, Chart.js, SweetAlert2 e íconos se cargan por CDN)

## Puesta en marcha
1. Inicia MySQL.
2. Revisa el usuario y la clave en `src/main/resources/application.properties`
   (por defecto `root` sin clave). También puedes usar variables de entorno:
   - Windows PowerShell: `$env:DB_USER="root"; $env:DB_PASSWORD="tu_clave"`
   - Linux/macOS: `export DB_USER=root DB_PASSWORD=tu_clave`
3. Ejecuta:
   ```
   mvn spring-boot:run
   ```
   (o corre la clase `PlustwentyApplication` desde tu IDE).
4. Abre **http://localhost:8080** (no abras los HTML con doble clic: ahora necesitan el servidor).

Al primer arranque se crea la base `plustwenty_db`, se generan las tablas y se cargan los datos de
demostración (`src/main/resources/seed/seed.json`, idénticos a los del prototipo).
Si prefieres crear la base a mano, usa `database/crear_bd.sql`.

## Cuentas de demostración
| Perfil | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin` | `admin123` |
| Caja (administradora) | `caja` | `caja123` |
| Estudiante | `estudiante` | `123456` |
| Apoderado | `apoderado` | `123456` |
| Otros estudiantes | su DNI | su DNI |

El enlace **Restablecer datos demo** del login borra la base y recarga los datos de ejemplo
(solo funciona desde el mismo equipo donde corre el servidor).

## Qué cambió respecto al prototipo
**Frontend:** las pantallas, estilos y lógica son los mismos. Solo cambió la capa de datos de `js/app.js`
(en vez de `localStorage` ahora llama a la API) y el cambio de contraseña en `js/user.js`.
`admin.js`, los HTML y el CSS son idénticos.

**Backend (nuevo):**
- Entidades JPA: Programa, Ciclo, Estudiante (+ Apoderado), Usuario, Matricula, Pension, Pago,
  ComprobantePago, Notificacion, Auditoria y Contador → tablas en MySQL.
- Login con **sesión del servidor**; contraseñas guardadas con **BCrypt** (nunca viajan al navegador).
- **Autorización por rol:** el administrador ve y modifica todo; el estudiante/apoderado solo ve su
  expediente y solo puede reportar pagos, editar sus datos de contacto y leer sus notificaciones.
- **Validaciones en el servidor:** DNI de 8 dígitos y único, teléfonos de 9 dígitos numéricos,
  N.º de operación de 6 dígitos numéricos (Yape/Plin), usuario único, monto mayor a cero.
- **Correlativos atómicos** (recibos, matrículas, estudiantes, caja) en la tabla `contador`.
- Los vouchers se guardan en `comprobante_pago` y se entregan por `GET /api/pagos/{id}/comprobante`
  (solo administrador o dueño del pago).
- Los datos se recargan al cambiar de sección, así varios usuarios ven lo último guardado.

## Estructura
```
src/main/java/pe/plustwenty
├── config/      AuthInterceptor, WebConfig, PasswordConfig, SeedRunner
├── model/       entidades JPA (las mismas propiedades que usa el frontend)
├── repository/  Spring Data JPA
├── service/     DataService (reglas y permisos), CounterService, SeedService, SesionService
└── web/         AuthController, DataController, CounterController, VoucherController, DemoController
src/main/resources
├── static/      frontend (index.html + PLUSTWENTY/…)
├── seed/seed.json
└── application.properties
```

## API
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` · `/logout` · `/change-password` | Sesión |
| GET | `/api/bootstrap` | Sesión actual + datos visibles para ese usuario |
| POST | `/api/data/{coleccion}` y `/batch` | Crear uno o varios registros |
| PATCH | `/api/data/{coleccion}/{id}` | Actualización parcial |
| POST | `/api/counters/{nombre}/next` | Siguiente correlativo (admin) |
| GET | `/api/pagos/{id}/comprobante` | Imagen del voucher |
| POST | `/api/demo/reset` | Restablecer datos demo (solo localhost) |

Colecciones: `programas, ciclos, estudiantes, users, matriculas, pensiones, pagos, notificaciones, auditoria`.

## Notas de diseño
- Las fechas se guardan como texto ISO (`2026-10-18`, `2026-10-18T10:15:00`), tal como las maneja el frontend.
- Las referencias entre tablas (`estudianteId`, `cicloId`, …) son columnas simples sin llaves foráneas,
  igual que el modelo del prototipo. Agregar FKs es una mejora posible.
- El frontend usa llamadas XHR **síncronas** para conservar exactamente la misma lógica de pantallas.
  El navegador muestra un aviso de "deprecated" en consola; no afecta el funcionamiento.
- Para uso real: desactiva `plustwenty.demo.reset-enabled`, usa HTTPS y cambia las contraseñas de demostración.
