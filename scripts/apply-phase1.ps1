param(
  [string]$Psql = "psql"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$sqlDir = Join-Path $root "db/postgres"

& $Psql -v ON_ERROR_STOP=1 -f (Join-Path $sqlDir "00_extensions.sql")
& $Psql -v ON_ERROR_STOP=1 -f (Join-Path $sqlDir "01_schema.sql")
& $Psql -v ON_ERROR_STOP=1 -f (Join-Path $sqlDir "02_alter_demo.sql")
