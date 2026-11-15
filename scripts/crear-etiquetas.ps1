# Crea las etiquetas del seguimiento de incidencias. Requiere GitHub CLI con sesion iniciada (gh auth login).
#   Uso (desde la raiz del proyecto):   .\scripts\crear-etiquetas.ps1
$ErrorActionPreference = 'Stop'

$etiquetas = @(
    @('bug',                   'd73a4a', 'Falla del sistema'),
    @('estado:abierta',        'e4e669', 'Registrada, sin atender'),
    @('estado:en-curso',       'fbca04', 'Alguien la está corrigiendo'),
    @('estado:resuelta',       '0e8a16', 'Corregida; falta que otra persona la verifique'),
    @('estado:verificada',     '1d76db', 'Verificada por alguien distinto a quien reportó'),
    @('severidad:alta',        'b60205', 'Impide pagar o matricular, o muestra montos incorrectos'),
    @('severidad:media',       'd93f0b', 'Molesta, pero hay alternativa'),
    @('severidad:baja',        'c5def5', 'Detalle visual o de texto'),
    @('reportada-por-usuario', '5319e7', 'Reportada durante la prueba del SUS')
)

foreach ($e in $etiquetas) {
    gh label create $e[0] --color $e[1] --description $e[2] --force
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear la etiqueta $($e[0])" }
}
Write-Host 'Etiquetas listas.' -ForegroundColor Green
