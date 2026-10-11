$ErrorActionPreference = 'Stop'
$source = 'C:\Users\kevin\Downloads\Reporte Kevin Adán 1SEM-10 (1).docx'
$destination = 'C:\Users\kevin\sistema_inscripcion_a_cursos\yesems-sistema\docs\Reporte semanal 05 al 09 octubre 2026.docx'
if (!(Test-Path -LiteralPath $source)) { throw 'No se encontró la plantilla indicada.' }
if (Test-Path -LiteralPath $destination) { throw 'Ya existe un reporte de salida; no se sobrescribirá.' }
$sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
$word = $null
$report = $null

function Fill-Cell($table, [int]$row, [int]$column, [string]$text) {
    $cell = $table.Cell($row, $column)
    $cell.Range.Text = $text
    $cell.Range.Font.Name = 'Arial'
    $cell.Range.Font.Size = 10
    $cell.Range.Font.Bold = 0
    $cell.Range.ParagraphFormat.Alignment = 0
    $cell.Range.ParagraphFormat.SpaceAfter = 3
}

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $report = $word.Documents.Open($source, $false, $true)
    if ($report.Tables.Count -ne 5) { throw 'La plantilla no tiene las cinco tablas esperadas.' }
    $report.SaveAs2($destination, 16)

    $days = @(
        @('Lunes 05/10/2026', 'Actualización de cursos y catálogo.', 'Se revisó la información proporcionada para los cursos de Reparación de celulares, Sublimación y diseño, Corte y grabado láser e Impresión 3D; se ajustaron datos generales de duración, costo y requisito de inscripción.', 'Oferta de cursos organizada para su integración al sistema.', 'Terminado'),
        @('Martes 06/10/2026', 'Búsqueda, filtros y respaldo.', 'Se añadieron herramientas para localizar información de inscripciones, pagos y cursos; también se documentó el respaldo cifrado y el proceso de recuperación.', 'Paneles con filtros y documentación de recuperación segura.', 'Terminado'),
        @('Miércoles 07/10/2026', 'Acceso, recuperación y Gmail API.', 'Se revisó el flujo de verificación por correo, recuperación de contraseña y acceso con Google. Se añadieron diagnósticos seguros para errores de Gmail OAuth y la creación de contraseña propia de YES EMS después de verificar la cuenta.', 'Flujo de acceso reforzado y mensajes de diagnóstico sin exponer credenciales.', 'En proceso'),
        @('Jueves 08/10/2026', 'Diseño del aula virtual.', 'Se definió la organización de cursos por módulos y materiales PDF. Se estableció que solo el administrador puede cargar, publicar, ocultar y administrar el contenido.', 'Estructura funcional curso → módulo → PDF y reglas de acceso definidas.', 'Terminado'),
        @('Viernes 09/10/2026', 'Implementación y pruebas del aula virtual.', 'Se implementaron módulos con título, descripción y orden; carga de PDF con nombre, borradores, publicación, ocultamiento y acceso condicionado a inscripción vigente y pago aprobado.', 'Aula virtual documentada. 160 pruebas unitarias y 6 pruebas aisladas del aula/PDF aprobadas localmente.', 'Terminado')
    )
    $daily = $report.Tables.Item(3)
    for ($r = 0; $r -lt $days.Count; $r++) {
        for ($c = 0; $c -lt 5; $c++) { Fill-Cell $daily ($r + 2) ($c + 1) $days[$r][$c] }
    }
    $daily.Rows.Item(1).HeadingFormat = -1

    $evidence = @(
        @('1', 'Cambios de catálogo, acceso y recuperación en el historial del proyecto.', 'https://github.com/kevincristobal93-star/yesems-sistema'),
        @('2', 'Búsqueda, filtros y respaldo/recuperación.', 'RESPALDOS_RECUPERACION.md'),
        @('3', 'Configuración y diagnóstico de Gmail API.', 'GMAIL_API.md'),
        @('4', 'Aula virtual: módulos, PDF, permisos y pruebas.', 'AULA_VIRTUAL.md')
    )
    $evidenceTable = $report.Tables.Item(4)
    for ($r = 0; $r -lt $evidence.Count; $r++) {
        for ($c = 0; $c -lt 3; $c++) { Fill-Cell $evidenceTable ($r + 2) ($c + 1) $evidence[$r][$c] }
        if ($evidence[$r][2] -like 'https://*') {
            $anchor = $evidenceTable.Cell($r + 2, 3).Range
            $anchor.End = $anchor.End - 1
            $null = $report.Hyperlinks.Add($anchor, $evidence[$r][2])
        }
    }
    $evidenceTable.Rows.Item(1).HeadingFormat = -1

    $pending = @(
        @('Validación real de Gmail API.', 'El flujo y los diagnósticos están implementados, pero falta confirmar recepción real con una configuración OAuth válida en el entorno autorizado.', 'Configurar credenciales autorizadas, renovar el token si es necesario y registrar una prueba de envío sin exponer datos sensibles.'),
        @('Validación real de Cloudinary.', 'El aula virtual valida y protege PDF en pruebas locales; la carga real requiere credenciales de Cloudinary en Render.', 'Configurar el almacenamiento privado y comprobar carga, consulta autorizada y permanencia después de un redeploy.'),
        @('Publicación y recorrido integral en Render.', 'Los cambios del aula virtual están probados localmente, pero aún no se han publicado en producción.', 'Revisar cambios, subirlos a GitHub, desplegar en Render y verificar el recorrido completo con datos de prueba.')
    )
    $pendingTable = $report.Tables.Item(5)
    while ($pendingTable.Rows.Count -lt ($pending.Count + 1)) { $null = $pendingTable.Rows.Add() }
    for ($r = 0; $r -lt $pending.Count; $r++) {
        for ($c = 0; $c -lt 3; $c++) { Fill-Cell $pendingTable ($r + 2) ($c + 1) $pending[$r][$c] }
    }
    $pendingTable.Rows.Item(1).HeadingFormat = -1

    $observations = 'Observaciones: Durante la semana se avanzó en la preparación del sistema para su cierre: se organizaron cursos, se reforzó el acceso y la recuperación de cuentas, se añadieron filtros y documentación de respaldo, y se implementó el aula virtual por módulos con PDF. Las pruebas locales del aula y del sistema aprobadas no sustituyen la validación real de Gmail API, Cloudinary ni el recorrido final en Render. El sistema se encuentra en fase de integración y validación final antes de su uso real.'
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
    [pscustomobject]@{ Output = $destination; Pages = $pages; Tables = $report.Tables.Count } | ConvertTo-Json -Compress
} finally {
    if ($report) { $report.Close(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($report) }
    if ($word) { $word.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
}
if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $sourceHash) { throw 'La plantilla original cambió inesperadamente.' }
Write-Output 'Plantilla original conservada sin cambios.'
