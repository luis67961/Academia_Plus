# Registra en GitHub las fallas REALES que el equipo detectó y corrigió ANTES de usar GitHub Issues.
# Cada incidencia queda marcada como "registrada retroactivamente" y con su fecha real de deteccion,
# para que el tiempo de resolucion NO se calcule con la fecha de hoy.
#
# ANTES DE EJECUTAR
#   1) gh auth login   y   .\scripts\crear-etiquetas.ps1
#   2) Si alguna de las incidencias de la lista NO ocurrio en su proyecto, escriba su número en $omitir
#      (solo se registra lo que realmente paso). Ejemplo:  $omitir = @(4, 6)
#
#   Uso (desde la raiz del proyecto):   .\scripts\crear-incidencias-iniciales.ps1
param([string]$Responsable = '@luis67961')
$ErrorActionPreference = 'Stop'

$omitir = @()          # <- números de incidencias que NO ocurrieron

$hoy = Get-Date -Format 'yyyy-MM-dd'
$fechaAnteriores = Read-Host 'Fecha en que el equipo detectó las fallas 1 a 8 (AAAA-MM-DD)'
if ($fechaAnteriores -notmatch '^\d{4}-\d{2}-\d{2}$') { throw 'Formato de fecha invalido. Use AAAA-MM-DD.' }
$fechaSesion = '2026-11-14'   # fallas 9 a 14: detectadas en las pruebas del 14 de noviembre

$incidencias = @(
    @{ N=1; Sev='alta';  Fecha=$fechaAnteriores; Titulo='Error 500 al reportar un pago como estudiante';
       Pasos="1. Ingresar como estudiante`n2. Reportar Pago > elegir cuota, monto, número de operación y voucher`n3. Enviar";
       Esperado='El pago queda registrado como Pendiente';
       Obtenido="Alerta 'No se pudo completar la operación - Internal Server Error'" },

    @{ N=2; Sev='alta';  Fecha=$fechaAnteriores; Titulo='El estudiante puede pagar cuotas en cualquier orden';
       Pasos="1. Ingresar como estudiante con varias cuotas pendientes`n2. Mis Pensiones > pagar una cuota posterior a la más antigua";
       Esperado='Solo se puede pagar la cuota más antigua; las demás quedan bloqueadas';
       Obtenido='Todas las cuotas tenían el botón Pagar habilitado' },

    @{ N=3; Sev='alta';  Fecha=$fechaAnteriores; Titulo='La mora por pago atrasado no se aplicaba';
       Pasos="1. Tener una cuota vencida hace varios días`n2. Ver Mis Pensiones o Reportar Pago";
       Esperado='Se suma 1 % diario de mora (máximo 20 % de la cuota) con detalle en el ojito';
       Obtenido='El total a pagar era igual al saldo, sin mora' },

    @{ N=4; Sev='media'; Fecha=$fechaAnteriores; Titulo='El campo teléfono acepta números repetidos (999999999)';
       Pasos="1. Mi Perfil > Teléfono`n2. Escribir 999999999 o 911111111 y guardar";
       Esperado='Se rechaza el número por ser repetido';
       Obtenido='Se guardaba sin ninguna validación' },

    @{ N=5; Sev='media'; Fecha=$fechaAnteriores; Titulo='El correo acepta caracteres extraños y doble arroba';
       Pasos="1. Mi Perfil > Correo electrónico`n2. Escribir un correo con 2 arrobas o símbolos como ñ, comillas o espacios";
       Esperado='Se rechaza o se limpia el texto inválido';
       Obtenido='El formulario aceptaba cualquier texto' },

    @{ N=6; Sev='baja';  Fecha=$fechaAnteriores; Titulo='La dirección acepta caracteres no permitidos';
       Pasos="1. Mi Perfil > Dirección`n2. Escribir símbolos como <, >, { o repetir el mismo carácter muchas veces";
       Esperado='Solo se aceptan letras, números y . , # / -';
       Obtenido='Se aceptaba cualquier carácter' },

    @{ N=7; Sev='baja';  Fecha=$fechaAnteriores; Titulo='Los campos de contraseña no permiten mostrar u ocultar el texto';
       Pasos="1. Mi Perfil > Cambiar contraseña`n2. Intentar ver lo escrito en los campos";
       Esperado='Cada campo tiene un ojito para mostrar u ocultar';
       Obtenido='No existía esa opción' },

    @{ N=8; Sev='media'; Fecha=$fechaAnteriores; Titulo='Guardar una matrícula tarda unos 3 s sin ningún aviso';
       Pasos="1. Registrar una matrícula como administrador`n2. Presionar Guardar";
       Esperado="Se muestra un indicador 'Guardando...' y se evita el doble clic";
       Obtenido='La pantalla parecía congelada y se podía enviar dos veces' },

    @{ N=9; Sev='alta';  Fecha=$fechaSesion; Titulo='El cobro en caja permite cobrar una cuota por partes (monto editable)';
       Pasos="1. Ingresar como administrador > Verificación de Pagos > Registrar Pago en Efectivo`n2. Elegir estudiante y cuota`n3. Cambiar el monto por uno menor";
       Esperado='El monto queda bloqueado en el total de la cuota; no hay pagos parciales';
       Obtenido='El monto se podía editar y se registraba un pago parcial' },

    @{ N=10; Sev='media'; Fecha=$fechaSesion; Titulo='Nuevo Ciclo acepta fechas pasadas (por ejemplo 2025)';
       Pasos="1. Administrador > Conf. Académica > Nuevo Ciclo`n2. Elegir una fecha de inicio anterior a hoy`n3. Guardar";
       Esperado='Se rechaza la fecha pasada y se valida la duración del ciclo';
       Obtenido='El ciclo se creaba con fechas antiguas' },

    @{ N=11; Sev='media'; Fecha=$fechaSesion; Titulo='Matrícula, pensión y número de pensiones sin tope máximo';
       Pasos="1. Administrador > Nuevo Ciclo`n2. Escribir un costo de matrícula o pensión muy alto, o más de 10 pensiones`n3. Guardar";
       Esperado='Matrícula y pensión con máximo S/ 500 y hasta 10 pensiones';
       Obtenido='Se aceptaban montos y cantidades irreales' },

    @{ N=12; Sev='baja';  Fecha=$fechaSesion; Titulo='El detalle de la mora muestra una fila que genera confusión';
       Pasos="1. Abrir una cuota vencida con mora`n2. Presionar el ojito para ver el detalle";
       Esperado='El detalle muestra solo el cálculo claro de la mora y su tope';
       Obtenido="Una fila 'Mora por los días de atraso' repetía el cálculo y confundía" },

    @{ N=13; Sev='alta';  Fecha=$fechaSesion; Titulo='El cobro en caja no respeta el orden de pago (matrícula primero)';
       Pasos="1. Administrador > Registrar Pago en Efectivo`n2. Elegir un estudiante con matrícula y pensiones pendientes`n3. Elegir una pensión posterior";
       Esperado='La matrícula es el primer pago; las demás cuotas quedan con candado hasta pagar la anterior';
       Obtenido='Se podía cobrar cualquier cuota sin pagar antes la matrícula' },

    @{ N=14; Sev='media'; Fecha=$fechaSesion; Titulo='Nueva Cuota Individual permite tipos y montos que no corresponden';
       Pasos="1. Administrador > Pensiones > Nueva Cuota Individual`n2. Revisar los tipos de obligación y escribir un importe alto";
       Esperado='Solo Materiales/Separatas y Simulacro Especial, con importe máximo S/ 200 y búsqueda de ciclo por siglas';
       Obtenido='Se podían crear pensiones y matrículas sueltas, importes de hasta S/ 20000 y el ciclo era un combo largo' }
)

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) 'incidencia.md'
$utf8SinBom = New-Object System.Text.UTF8Encoding($false)

foreach ($i in $incidencias) {
    if ($omitir -contains $i.N) { Write-Host "Omitida: $($i.N)"; continue }
    $cuerpo = @"
**Origen:** Detectada por el equipo
**Severidad:** $($i.Sev)
**Responsable:** $Responsable
**Detectada el:** $($i.Fecha)
**Registrada en GitHub el:** $hoy (registro retroactivo: la falla ya había sido detectada antes de abrir esta incidencia)

### Pasos para reproducir
$($i.Pasos)

### Resultado esperado
$($i.Esperado)

### Resultado obtenido
$($i.Obtenido)

### Evidencia
(adjuntar captura de la falla, si se conserva)
"@
    [System.IO.File]::WriteAllText($tmp, $cuerpo, $utf8SinBom)
    gh issue create --title "[BUG] $($i.Titulo)" --label "bug,estado:abierta,severidad:$($i.Sev)" --body-file $tmp
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear la incidencia $($i.N)" }
}
Write-Host 'Listo: revise la pestaña Issues del repositorio.' -ForegroundColor Green
