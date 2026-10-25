param(
  [string]$Psql = "psql"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$resetSql = Join-Path $root "db/postgres/reset.sql"

& $Psql -v ON_ERROR_STOP=1 -f $resetSql
