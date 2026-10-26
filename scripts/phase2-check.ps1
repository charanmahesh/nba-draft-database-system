param(
  [string]$Psql = "psql"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$reset = Join-Path $PSScriptRoot "reset-db.ps1"
$phase1 = Join-Path $PSScriptRoot "apply-phase1.ps1"
$phase2 = Join-Path $PSScriptRoot "apply-phase2.ps1"
$queries = Join-Path $root "db/postgres/07_queries.sql"

& $reset -Psql $Psql
& $phase1 -Psql $Psql
& $phase2 -Psql $Psql
& $phase2 -Psql $Psql
& $Psql -v ON_ERROR_STOP=1 -f $queries

# Verify the reset process and a clean re-application after the acceptance run.
& $reset -Psql $Psql
& $phase1 -Psql $Psql
& $phase2 -Psql $Psql
& $Psql -v ON_ERROR_STOP=1 -f $queries

Write-Output "Phase 2 objects applied twice, failing cases verified, reset verified, and checks passed."
