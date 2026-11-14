# APF3 · Evidencias 1 a 4 — guía del equipo

Repositorio: `<USUARIO>/<REPO>` (reemplazar). Aquí se explica **qué hay en el repositorio, cómo se usa y cómo se demuestra** cada evidencia.

---

## Evidencia 1 · Seguimiento de incidencias (3 pts)

**Dónde viven:** pestaña **Issues** de GitHub, con el formulario `.github/ISSUE_TEMPLATE/incidencia.yml`
(título, pasos para reproducir, resultado esperado/obtenido, severidad, responsable y evidencia).

**Flujo (se refleja con etiquetas y en el tablero del proyecto):**

```
estado:abierta → estado:en-curso → estado:resuelta → estado:verificada
```

| Paso | Quién | Cómo |
|---|---|---|
| Registrar | quien detecta la falla | Issues → New issue → "Incidencia (bug)" |
| Atender | el responsable | etiqueta `estado:en-curso`, rama `fix/<n>-descripcion` |
| Resolver | el responsable | PR que dice `Closes #n`; el CI debe estar en verde; etiqueta `estado:resuelta` |
| Verificar | **otra persona distinta a quien reportó** | prueba el caso original, comenta "verificado" y pone `estado:verificada` |

**Preparación (una sola vez, en PowerShell, desde la raíz del proyecto):**
1. `gh auth login`
2. `.\scripts\crear-etiquetas.ps1` → crea `bug`, `estado:*`, `severidad:*`, `reportada-por-usuario`.
3. `.\scripts\crear-incidencias-iniciales.ps1` → registra las fallas reales que el equipo ya corrigió. Cada una queda marcada como **registro retroactivo** y con su **fecha real de detección**, para no inflar los tiempos con la fecha de hoy. Las que no ocurrieron en el proyecto se excluyen con `$omitir`: solo se registra lo real.
4. Para marcar una incidencia como resuelta: `.\scripts\resolver-incidencia.ps1 -Numero N -Correccion "commit abc1234" -Fecha AAAA-MM-DD`. La **verifica y cierra otra persona** (etiqueta `estado:verificada` + comentario + cerrar).
5. Durante la prueba del SUS, cada falla que reporte un encuestado se registra con origen "Reportada por un usuario" y la etiqueta `reportada-por-usuario`.

**Lo que se entrega:** el listado de ≥ 8 incidencias reales: cuántas se resolvieron, en cuánto tiempo (fecha de apertura → cierre) y cuáles siguen abiertas y por qué.
Se obtiene con: `.\scripts\listado-incidencias.ps1` (tabla en pantalla y archivo `incidencias.csv`).

**Error frecuente que se evita:** cerrar sin verificación. Quien reporta no es quien cierra.

---

## Evidencia 2 · Integración continua (4 pts)

**Archivo:** `.github/workflows/ci.yml`. Se ejecuta **solo en cada push a `develop`/`main` y en cada solicitud pull**, con dos trabajos:

| Trabajo | Qué hace |
|---|---|
| Compilar y probar (Java 17 + Maven) | `mvn verify`: compila, ejecuta todas las pruebas JUnit y empaqueta el JAR |
| Pruebas de reglas del frontend | `node --test pruebas/*.test.js src/test/js/*.cjs`: mora (1 % diario, tope 20 %), orden de pago e inicio de sesión |

**Para que "con el pipeline en rojo no se fusione nada":**
GitHub → Settings → Branches → *Add branch protection rule* para `develop` y `main`:
- ✅ Require a pull request before merging (1 aprobación)
- ✅ Require status checks to pass before merging → marcar los dos trabajos de arriba (aparecen después de la primera ejecución)

**Insignia en el README** (pegar al inicio, cambiando `<USUARIO>/<REPO>`):

```markdown
[![CI](https://github.com/<USUARIO>/<REPO>/actions/workflows/ci.yml/badge.svg)](https://github.com/<USUARIO>/<REPO>/actions/workflows/ci.yml)
```

**Lo que se revisa:** el archivo, el historial de ejecuciones (Actions) con corridas en verde **y en rojo**, la insignia y la comprobación automática en las solicitudes pull del sprint 3.

**Error frecuente:** crearlo el día anterior. Empieza hoy: haz todos los cambios por PR para que el historial sea real. No se fuerzan fallos; las corridas en rojo aparecerán solas cuando una prueba detecte un problema, y lo que importa es que se corrijan antes de fusionar.

---

## Evidencia 3 · Pruebas automatizadas (3 pts)

Mínimo pedido: **1 prueba por operación del CRUD + 2 de la funcionalidad diferenciadora**.

**CRUD de la entidad núcleo (Estudiante)** — `src/test/java/pe/plustwenty/EstudianteCrudTests.java`

| Operación | Pruebas |
|---|---|
| Create | crea ficha + cuenta con contraseña cifrada; rechaza DNI ≠ 8 dígitos, DNI duplicado, teléfono inválido (9 dígitos que empiecen con 9), correo inválido y fecha de nacimiento futura |
| Read | el administrador ve todos; el estudiante solo su propia ficha |
| Update | el admin cambia datos; el estudiante solo su contacto (no DNI ni nombres); no edita la ficha de otro; teléfono inválido y registro inexistente |
| Delete | baja lógica (`activo = false`): el registro se conserva con su historial |

**Funcionalidad diferenciadora (control de pagos y pensiones)**

| Archivo | Qué comprueba |
|---|---|
| `PagosReglasTests.java` | un pago reportado siempre queda *Pendiente* y sin recibo (aunque el cliente intente colarlo como aprobado); monto > 0; no se paga la cuota de otro estudiante; solo Yape/Plin; operación de 6 dígitos; aprobar genera recibo y notifica; no se aprueba dos veces; rechazar exige motivo; cobro en caja |
| `MatriculaCronogramaTests.java` | matricular genera cargo de matrícula + N pensiones con vencimiento el día 15; regla de los 3 días; actualiza ciclo del estudiante |
| `pruebas/mora.test.js` | **mora 1 % diario con tope 20 %**: 10 días = S/ 40; 45 días = S/ 80 (tope); sobre el saldo; hasta la fecha de pago; sin mora si está pagada/anulada |
| `pruebas/orden-pago.test.js` | solo se habilita la cuota más antigua de cada matrícula; **la matrícula se paga primero**, aunque venza después de la Pensión 1 |

**Cómo ejecutarlas:**
```powershell
.\mvnw.cmd test                 # pruebas Java
node --test (Get-ChildItem pruebas\*.test.js, src\test\js\*.cjs).FullName   # pruebas del frontend (Node 20 o superior)
```

En Linux/macOS/Git Bash: `node --test pruebas/*.test.js src/test/js/*.cjs`.

Todas verifican resultados concretos (estado, montos, códigos de error, que **no** se guarde nada cuando debe rechazarse); ninguna es un `assert true`.
Las pruebas del frontend buscan `js/app.js` en `src/main/resources/static/PLUSTWENTY/js/` (o en la ruta de la variable `APP_JS`).

---

## Evidencia 4 · Entrega continua (3 pts)

**Archivos:** `.github/workflows/cd.yml`, `scripts/deploy.sh` y la ruta pública `GET /api/health` (`HealthController`), que usa la prueba de humo.

**Cómo funciona:** al crear y subir una etiqueta `vX.Y.Z`, GitHub Actions (1) repite las pruebas y (2) solo si pasan, despliega a Render con `scripts/deploy.sh` (un solo comando), (3) comprueba que `/api/health` responde, (4) registra el despliegue y (5) publica el Release con notas automáticas.

**Configuración (una sola vez):**
1. En Render → tu servicio → **Settings → Build & Deploy → Auto-Deploy → Off**. Así solo despliega el CD y no cada push. *Desde entonces, cada versión nueva se publica con una etiqueta.*
2. Render → Settings → **Deploy Hook**: copiar la URL (contiene una clave: es un secreto).
3. GitHub → Settings → Secrets and variables → Actions:
   - *Secret* `RENDER_DEPLOY_HOOK_URL` = la URL del hook (**nunca** en el código).
   - *Variable* `APP_URL` = `https://<tu-app>.onrender.com` (para la prueba de humo `/api/health`).
4. (Opcional) Settings → Environments → `produccion` → *Required reviewers*.

**Publicar una versión** (la etiqueta se pone sobre un commit de `main` que ya contiene `cd.yml`):
```powershell
git checkout main
git pull
git tag -a v1.1.0 -m "Mora 1 % diario, orden de pago y despliegue continuo"
git push origin v1.1.0
```
Hacer **al menos dos despliegues distintos** (`v1.1.0` y `v1.1.1`), cada uno con un cambio real.

**Bitácora de despliegues:** Actions → *CD* → cada ejecución muestra versión, commit, quién la disparó y cuándo (pestaña *Summary*); además queda el Release en GitHub. Copiar cada despliegue real a `docs/BITACORA_DESPLIEGUES.md`.

### Procedimiento de vuelta atrás
Si una versión nueva falla, se vuelve a desplegar la etiqueta anterior:
1. GitHub → Actions → **CD** → *Run workflow* → `version` = la etiqueta anterior (ej. `v1.1.0`).
2. O, desde Git Bash: `RENDER_DEPLOY_HOOK_URL="..." bash scripts/deploy.sh v1.1.0`
3. Verificar `GET /api/health` y la operación que fallaba.
4. Registrar una incidencia con la causa y corregir en una nueva versión (`v1.1.2`), nunca editando una etiqueta publicada. Anotar la vuelta atrás en la tabla de `docs/BITACORA_DESPLIEGUES.md`.

> **Nota:** el script usa el parámetro `ref` del Deploy Hook de Render, que acepta el SHA de un commit ([documentación de Render](https://render.com/docs/deploy-hooks)); por eso el script convierte la etiqueta en su SHA. Para una vuelta atrás manual también sirve Render → Manual Deploy → *Deploy a specific commit*.

**Error frecuente:** subir archivos a mano y llamarlo entrega continua. Aquí cualquier persona puede repetir el despliegue con un comando.
