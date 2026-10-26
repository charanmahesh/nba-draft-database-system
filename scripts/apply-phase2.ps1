param(
  [string]$Psql = "psql"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$sqlDir = Join-Path $root "db/postgres"

& $Psql -v ON_ERROR_STOP=1 -f (Join-Path $sqlDir "03_views.sql")
& $Psql -v ON_ERROR_STOP=1 -f (Join-Path $sqlDir "04_functions.sql")
& $Psql -v ON_ERROR_STOP=1 -f (Join-Path $sqlDir "05_triggers.sql")
