# Lista todas las incidencias (para la entrega) y guarda incidencias.csv.
#   Uso:  .\scripts\listado-incidencias.ps1
$ErrorActionPreference = 'Stop'
$datos = gh issue list --state all --label bug --limit 200 --json number,title,state,createdAt,closedAt,labels | ConvertFrom-Json

$filas = foreach ($d in $datos | Sort-Object number) {
    $etq = ($d.labels | ForEach-Object { $_.name }) -join ', '
    $dias = if ($d.closedAt) { [math]::Round(([datetime]$d.closedAt - [datetime]$d.createdAt).TotalDays, 1) } else { '' }
    [pscustomobject]@{
        Número = $d.number; Estado = $d.state; Titulo = $d.title
        Abierta = ([datetime]$d.createdAt).ToString('yyyy-MM-dd'); Cerrada = if ($d.closedAt) { ([datetime]$d.closedAt).ToString('yyyy-MM-dd') } else { '' }
        'Días abierta' = $dias; Etiquetas = $etq
    }
}
$filas | Format-Table -AutoSize -Wrap
$filas | Export-Csv -Path 'incidencias.csv' -NoTypeInformation -Encoding UTF8
$cerradas = ($filas | Where-Object { $_.Estado -eq 'CLOSED' }).Count
Write-Host "Total: $($filas.Count)  |  Cerradas: $cerradas  |  Abiertas: $($filas.Count - $cerradas)" -ForegroundColor Cyan
Write-Host 'Se guardo incidencias.csv en la carpeta actual.'
