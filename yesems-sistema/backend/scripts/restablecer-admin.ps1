$ErrorActionPreference = 'Stop'

function Read-ResetSecret([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $secure.Dispose()
    }
}

try {
    $env:YESEMS_RESET_DATABASE_URL = Read-ResetSecret 'External Database URL de yesems-db (entrada oculta)'
    $env:YESEMS_RESET_PASSWORD = Read-ResetSecret 'Nueva contrasena del admin (minimo 12 caracteres, entrada oculta)'
    $resetConfirmation = Read-ResetSecret 'Repite la nueva contrasena'
    if ($env:YESEMS_RESET_PASSWORD -cne $resetConfirmation) { throw 'Las contrasenas no coinciden.' }
    $resetConfirmation = $null
    & node (Join-Path $PSScriptRoot 'restablecer-admin.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'El restablecimiento no fue confirmado. Revisa el mensaje anterior.' }
} finally {
    Remove-Item Env:YESEMS_RESET_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:YESEMS_RESET_PASSWORD -ErrorAction SilentlyContinue
    $resetConfirmation = $null
}
