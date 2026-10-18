param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9]{20}$')]
    [string]$ProjectRef,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $backendRoot
$allowlistPath = Join-Path $backendRoot 'project-ref.txt'
$knownYamachatRef = 'bxjvmjdppmqgbxfcowpf'

if (-not (Test-Path -LiteralPath $allowlistPath)) {
    throw 'Chybí project-ref.txt. Vytvořte jej ručně až pro samostatný projekt YamaSearch.'
}

$allowedRef = (Get-Content -LiteralPath $allowlistPath -Raw).Trim()
if ($ProjectRef -ne $allowedRef) {
    throw 'Zadaný projekt neodpovídá lokálnímu allowlistu YamaSearch.'
}
if ($ProjectRef -eq $knownYamachatRef) {
    throw 'Nasazení bylo zastaveno: cílem je projekt Yamachat, ne samostatný YamaSearch.'
}

if ($DryRun) {
    Write-Output "Kontrola cíle prošla pro samostatný projekt $ProjectRef. Databáze nebyla změněna."
    exit 0
}

Push-Location $projectRoot
try {
    & supabase link --project-ref $ProjectRef
    if ($LASTEXITCODE -ne 0) {
        throw "Supabase link selhal s kódem $LASTEXITCODE. Migrace nebyla spuštěna."
    }

    $linkedRefPath = Join-Path $backendRoot '.temp\project-ref'
    if (-not (Test-Path -LiteralPath $linkedRefPath)) {
        throw 'Supabase CLI po propojení nevytvořilo ověřitelný project ref.'
    }
    $linkedRef = (Get-Content -LiteralPath $linkedRefPath -Raw).Trim()
    if ($linkedRef -ne $ProjectRef -or $linkedRef -eq $knownYamachatRef) {
        throw 'Ověřený vzdálený projekt neodpovídá samostatnému projektu YamaSearch.'
    }

    & supabase db push
    if ($LASTEXITCODE -ne 0) {
        throw "Supabase db push selhal s kódem $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
