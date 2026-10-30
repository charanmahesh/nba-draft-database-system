param(
  [string]$Psql = "psql"
)

# Runs only the Phase 3A real-data import. Schema and Phase 2 database objects
# must already exist; this deliberately does not run text generation or embeds.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$importDir = Join-Path $root "db/import"

Push-Location $root
try {
  & $Psql -v ON_ERROR_STOP=1 -f (Join-Path $importDir "00_staging.sql")
  & $Psql -v ON_ERROR_STOP=1 -f (Join-Path $importDir "01_load.sql")
  & $Psql -v ON_ERROR_STOP=1 -f (Join-Path $importDir "02_transform.sql")
}
finally {
  Pop-Location
}
