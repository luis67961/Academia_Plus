# Marca una incidencia como RESUELTA y deja constancia de la correccion. NO la cierra:
# la cierra OTRA persona despues de verificarla (quien reporta no es quien cierra).
#   Uso:  .\scripts\resolver-incidencia.ps1 -Numero 3 -Correccion "commit a1b2c3d" -Fecha 2026-11-10
param(
    [Parameter(Mandatory)][int]$Numero,
    [Parameter(Mandatory)][string]$Correccion,                 # ej: "commit a1b2c3d" o "PR #46"
    [string]$Fecha = (Get-Date -Format 'yyyy-MM-dd')           # fecha REAL en que se corrigio
)
$ErrorActionPreference = 'Stop'

gh issue edit $Numero --add-label 'estado:resuelta'
if ($LASTEXITCODE -ne 0) { throw 'No se pudo poner la etiqueta estado:resuelta' }
foreach ($viejo in 'estado:abierta', 'estado:en-curso') {      # quita el estado anterior (si no lo tenia, se ignora)
    $ErrorActionPreference = 'Continue'
    gh issue edit $Numero --remove-label $viejo 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) 'resuelta.md'
$texto = "**Resuelta el $Fecha.** Corrección: $Correccion.`n`n**Para verificar:** repetir los pasos de la incidencia y comprobar que se obtiene el resultado esperado. Pendiente de verificación por otra persona del equipo."
[System.IO.File]::WriteAllText($tmp, $texto, (New-Object System.Text.UTF8Encoding($false)))
gh issue comment $Numero --body-file $tmp
Write-Host "Incidencia #$Numero marcada como resuelta." -ForegroundColor Green
