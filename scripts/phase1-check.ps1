param(
  [string]$Psql = "psql"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$reset = Join-Path $PSScriptRoot "reset-db.ps1"
$apply = Join-Path $PSScriptRoot "apply-phase1.ps1"
$acceptance = Join-Path $root "db/postgres/phase1_acceptance.sql"

& $reset -Psql $Psql
& $apply -Psql $Psql
& $apply -Psql $Psql
& $Psql -v ON_ERROR_STOP=1 -f $acceptance
& $reset -Psql $Psql
& $apply -Psql $Psql

Write-Output "Phase 1 schema applied twice, reset, and applied successfully."
