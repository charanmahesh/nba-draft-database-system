param(
  [string]$Psql = "psql"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Push-Location $root
try {
  & $Psql -v ON_ERROR_STOP=1 -f (Join-Path $root "db/postgres/06_seed.sql")
  if ($LASTEXITCODE -ne 0) {
    throw "Phase 3B SQL seed failed with exit code $LASTEXITCODE."
  }

  & npm.cmd run text:generate
  if ($LASTEXITCODE -ne 0) {
    throw "Phase 3B text generation failed with exit code $LASTEXITCODE."
  }
}
finally {
  Pop-Location
}
