$ErrorActionPreference = 'Stop'
$source = 'C:\Users\kevin\Downloads\Reporte Adan 5SEM-09 (1).docx'
$docs = 'C:\Users\kevin\sistema_inscripcion_a_cursos\yesems-sistema\docs'
$destination = Join-Path $docs 'Reporte semanal 28 septiembre al 02 octubre 2026.docx'
if (Test-Path -LiteralPath $destination) { throw 'La copia de salida ya existe; no se sobrescribirá.' }
$before = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
$word = $null
$report = $null
function Fill-Cell($table, [int]$row, [int]$column, [string]$text) {
    $cell = $table.Cell($row,$column)
    $cell.Range.Text = $text
    $cell.Range.Font.Name = 'Arial'
    $cell.Range.Font.Size = 10
    $cell.Range.Font.Bold = 0
    $cell.Range.ParagraphFormat.Alignment = 0
    $cell.Range.ParagraphFormat.SpaceAfter = 3
    $cell.Range.ParagraphFormat.LineSpacingRule = 0
}
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $report = $word.Documents.Open($source, $false, $true)
    if ($report.Tables.Count -ne 5) { throw 'La estructura del documento no coincide con la plantilla revisada.' }
    $report.SaveAs2($destination, 16)

    # Se conservan nombre, fechas y actividades asignadas de la plantilla original.
    $days = @(
        @('Lunes 28/09/2026', 'Revisión del sistema y planificación del seguimiento.', 'Se revisaron inscripciones, pagos y constancias para definir el avance real del alumno y los requisitos de conclusión por curso.', 'Criterios de seguimiento y tareas de implementación definidos.', 'En proceso'),
        @('Martes 29/09/2026', 'Implementación de asistencia, progreso y constancias.', 'Se integraron registros de cumplimiento, porcentaje mínimo por curso y validación administrativa de conclusión y pago; se reforzaron permisos.', 'Módulo integrado y migraciones que conservan los datos existentes.', 'Terminado'),
        @('Miércoles 30/09/2026', 'Pruebas del flujo de inscripción y seguimiento.', 'Se verificó inscripción, pago, asistencia, avance y descarga de constancia. Se corrigieron inscripción y reportes y se preparó la validación de Cloudinary.', '85 pruebas unitarias y 19 de integración aprobadas; capturas de los paneles. Carga real en Cloudinary pendiente.', 'En proceso'),
        @('Jueves 01/10/2026', 'Mejoras de acceso y recuperación de cuenta.', 'Se separaron inicio de sesión y registro, se ajustó la vista móvil y se diferenciaron la recuperación de Google y la contraseña de YES EMS.', 'Pantallas de acceso y recuperación mejoradas; controles de verificación incorporados.', 'Terminado'),
        @('Viernes 02/10/2026', 'Actualización del catálogo y pruebas finales de la etapa.', 'Se integró Gmail API y el comprobante de efectivo. Se agregaron cuatro propuestas de cursos, iconos, animación y detalle; Excel se retiró sin borrar historial.', '122 pruebas unitarias y 18 de integración aprobadas; cambios publicados y catálogo verificado en Render.', 'Terminado')
    )
    $daily = $report.Tables.Item(3)
    for ($r=0; $r -lt $days.Count; $r++) {
        for ($c=0; $c -lt 5; $c++) { Fill-Cell $daily ($r+2) ($c+1) $days[$r][$c] }
    }
    $daily.Rows.Item(1).HeadingFormat = -1

    $evidence = @(
        @('1','Sistema de inscripción y actualizaciones publicadas.','https://github.com/kevincristobal93-star/yesems-sistema'),
        @('2','Pruebas y capturas de asistencia, progreso y constancias (30/09).','evidencias/2026-09-30/README.md'),
        @('3','Acceso, registro, recuperación y vista móvil (jueves).','evidencias jueves/README.md'),
        @('4','Catálogo, iconos, detalle, inscripción y efectivo (viernes).','evidencias viernes/README.md')
    )
    $evidenceTable = $report.Tables.Item(4)
    for ($r=0; $r -lt $evidence.Count; $r++) {
        for ($c=0; $c -lt 3; $c++) { Fill-Cell $evidenceTable ($r+2) ($c+1) $evidence[$r][$c] }
        $anchor = $evidenceTable.Cell($r+2,3).Range
        $anchor.End = $anchor.End - 1
        $null = $report.Hyperlinks.Add($anchor, $evidence[$r][2])
    }
    $evidenceTable.Rows.Item(1).HeadingFormat = -1

    $pending = @(
        @('Validación externa de Cloudinary y correo.', 'Pruebas locales disponibles; falta acreditar carga real en Cloudinary y recepción de códigos en Gmail.', 'Configurar el entorno autorizado, ejecutar pruebas reales y registrar resultados sin exponer credenciales.'),
        @('Biblioteca digital y cierre de la oferta de cursos.', 'Organización de contenidos por validar. Los cuatro cursos mantienen horas y cupos sugeridos y precio por confirmar.', 'Confirmar materiales de biblioteca; revisar con YES EMS temarios, precios, fechas y requisitos antes de abrir inscripciones.'),
        @('Limpieza de cuentas de prueba.', 'Autorizada, pero no ejecutada: falta conexión a la base de Render.', 'Obtener acceso seguro, respaldar los datos y efectuar la limpieza conservando cursos y configuración.')
    )
    $pendingTable = $report.Tables.Item(5)
    while ($pendingTable.Rows.Count -lt ($pending.Count+1)) { $null = $pendingTable.Rows.Add() }
    for ($r=0; $r -lt $pending.Count; $r++) {
        for ($c=0; $c -lt 3; $c++) { Fill-Cell $pendingTable ($r+2) ($c+1) $pending[$r][$c] }
    }
    $pendingTable.Rows.Item(1).HeadingFormat = -1

    $observations = 'Observaciones: El proyecto se encuentra en etapa de cierre, con funciones principales implementadas y pendientes de validación externa. Los estados de terminado se refieren a la entrega de cada etapa, no al cierre total del proyecto. Las capturas de jueves y viernes se generaron el 02/10/2026 en un entorno local con datos ficticios; no acreditan correos o pagos reales. La elaboración y organización de recursos de biblioteca permanece por confirmar. Se conservó el formato y la información personal de la plantilla. La distribución del lunes resume la preparación del trabajo semanal y debe confirmarse antes de entregar.'
    $range = $report.Content
    $range.Find.ClearFormatting()
    if (!$range.Find.Execute('Observaciones:')) { throw 'No se encontró el campo de observaciones.' }
    $range.Text = $observations
    $range.Font.Name = 'Arial'
    $range.Font.Size = 10
    $range.Font.Bold = 0
    $report.Repaginate()
    $pages = $report.ComputeStatistics(2)
    $report.Save()
    [pscustomobject]@{Output=$destination; Pages=$pages; Tables=$report.Tables.Count; DailyRows=$daily.Rows.Count; EvidenceRows=$evidenceTable.Rows.Count; PendingRows=$pendingTable.Rows.Count} | ConvertTo-Json -Compress
} finally {
    if ($report) { $report.Close(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($report) }
    if ($word) { $word.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
}
if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $before) { throw 'El original cambió inesperadamente.' }
Write-Output 'Original conservado sin cambios.'
