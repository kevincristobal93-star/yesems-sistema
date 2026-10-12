$ErrorActionPreference = 'Stop'

function Read-PrivateValue([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $secure.Dispose()
    }
}

try {
    $env:YESEMS_ADMIN_DATABASE_URL = Read-PrivateValue 'External Database URL de yesems-db en Render (entrada oculta)'
    $env:YESEMS_ADMIN_PASSWORD = Read-PrivateValue 'Contrasena elegida para Oscar Daniel (entrada oculta)'
    $confirmation = Read-PrivateValue 'Repite la contrasena'
    if ($env:YESEMS_ADMIN_PASSWORD -cne $confirmation) { throw 'Las contrasenas no coinciden.' }
    $confirmation = $null
    & node (Join-Path $PSScriptRoot 'admin-unico-oscar.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'El alta no fue confirmada. Revisa el mensaje anterior.' }
} finally {
    Remove-Item Env:YESEMS_ADMIN_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:YESEMS_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    $confirmation = $null
}
