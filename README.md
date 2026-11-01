# DraftBoard

DraftBoard is a basketball scouting and team-recruitment application. It combines imported NBA statistics and safely matched combine measurements with generated demonstration reports and news. Generated text is not real scouting or journalism; draft workflows are a future extension.

## Prerequisites

- Git, Node.js 22 LTS and npm (verify with `node -v` and `npm -v`).
- Docker Desktop on macOS or Windows, or Docker Engine with the Compose plugin on Linux. Start Docker and check `docker compose version`.
- PostgreSQL 16 client tools, especially `psql`, on your **host** PATH (`psql --version`). The database itself runs in Docker. On macOS, `brew install libpq` and add its `bin` directory to PATH. On Windows, install the PostgreSQL command-line tools and add their `bin` directory to PATH. On Debian/Ubuntu, install `postgresql-client-16` from the PostgreSQL apt repository (or a compatible `postgresql-client`).
- Internet access for npm packages, the PostgreSQL image, Kaggle downloads and the first embedding-model download. The initial seed may take several minutes and requires disk space for datasets and the model.

Run all commands below from the repository root. macOS/Linux examples use a POSIX shell; Windows examples use PowerShell.

## 1. Clone and download data

Clone the repository and enter it:

```sh
git clone https://github.com/charanmahesh/nba-draft-database-system.git
cd nba-draft-database-system
```

Create a `dataset` directory. Download the following datasets from Kaggle (a Kaggle account may be required), extract the archives, and place these exact five filenames directly in `dataset/`:

| Download | Files to copy into `dataset/` |
| --- | --- |
| [Nathan Lauga — NBA Games](https://www.kaggle.com/datasets/nathanlauga/nba-games) | `teams.csv`, `players.csv`, `games.csv`, `games_details.csv` |
| [NBA Draft Combine Measurements](https://www.kaggle.com/datasets/marcusfern/nba-draft-combine) | `Draft Combine - Kaggle.csv` |

Keep the spaces in the combine filename. The import uses the 2017–2019 season subset; counts and matching rules are documented in [data sources](docs/data-sources.md) and [mapping](db/import/mapping.md). The files are gitignored and are not supplied in the clone. Dataset contents can change upstream, so exact test counts require the documented snapshot.

## 2. Configure environment

Copy `.env.example` to `.env` (`cp .env.example .env` on macOS/Linux; `Copy-Item .env.example .env` in PowerShell). Set every value:

```dotenv
PG_HOST=localhost
PG_PORT=5432
PG_USER=<choose_a_local_database_user>
PG_PASSWORD=<choose_a_local_database_password>
PG_DATABASE=<choose_a_local_database_name>
JWT_SECRET=<generate_a_random_secret_at_least_32_characters>
```

Use simple letters, digits and underscores for the local database user and name, and a strong password and secret. Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. If port 5432 is occupied, set `PG_PORT` to an available host port such as `5433`; Compose maps that port to the container's 5432. Keep `.env` private and never commit it. The database user and database are created when the Compose volume is first initialized; changing those values later does not reinitialize an existing volume.

## 3. Start and seed

```sh
docker compose up -d
npm install
npm run seed
npm run dev
```

Wait for PostgreSQL to be ready before seeding; if it is still starting, retry `npm run seed`. **Seeding resets the configured database's public schema and destroys its existing data.** Use a dedicated local database. The seed creates schema, imports CSVs, creates demo accounts and needs, generates synthetic reports and articles, embeds their text, builds vector indexes, and evaluates retrieval. The first embedding run downloads `Xenova/all-MiniLM-L6-v2` from Hugging Face into the local transformers cache; it requires network access and can take time. Later runs reuse the cache. See [vector search](docs/vector-search.md).

Open [http://localhost:3000](http://localhost:3000); `/api/health` checks database and pgvector connectivity. If port 3000 is occupied, use `npm run dev -- -p 3001` and open that port instead. Stop the app with Ctrl+C. To stop the database without deleting its data, run `docker compose down`. Do not use `down -v` unless you intend to delete the Compose volume.

## Demo sign-in

All four local demo accounts use password `DraftBoardDemo!2026`:

| Role | Email |
| --- | --- |
| Admin | `admin@draftboard.local` |
| Scout | `scout@draftboard.local` |
| Analyst | `analyst@draftboard.local` |
| Team manager | `manager@draftboard.local` |

These are shared development-only credentials. Replace the demo data and credentials before any real deployment.

## Tests

The configured PostgreSQL user must have `CREATEDB` and pgvector-extension privileges (the Compose-created user has them). The five CSV files and `psql` must be available. `npm test` runs Vitest SQL, vector and import tests in temporary databases; `npm run test:all` also seeds a separate acceptance database and runs API and Playwright browser matrices on temporary ports. Neither suite seeds the configured development database. An interrupted run can leave temporary databases, servers or files; inspect them before removal.

Install Chromium once for the browser suite:

```sh
npx playwright install chromium
npm test
```

On macOS/Linux run the full suite with:

```sh
DEMO_PASSWORD='DraftBoardDemo!2026' npm run test:all
```

In PowerShell:

```powershell
$env:DEMO_PASSWORD = 'DraftBoardDemo!2026'
npm run test:all
Remove-Item Env:DEMO_PASSWORD
```

On Linux, Playwright may require additional system packages; see the instructions printed by Playwright or run `npx playwright install-deps chromium` with appropriate system privileges. Standalone browser state and mobile checks are `npm run check:ui:states` and `npm run check:ui:mobile`. See [test results](docs/test-results.md) for scope and limitations.

## Documentation

[Architecture](docs/architecture.md) · [ER model](docs/er-diagram.png) · [Data dictionary](docs/data-dictionary.md) · [API](docs/api.md) · [SQL examples](docs/queries.md) · [Database justification](docs/db-justification.md)

### Dependency audit

On 2026-11-01, `npm audit fix` made no dependency changes; `npm audit` still reported 10 affected packages (2 moderate, 5 high, 3 critical). The remaining chains include Next's bundled PostCSS, Vitest's mocker and tinypool, and the fixed `@xenova/transformers` dependency's sharp and ONNX/protobuf dependencies. npm proposes major upgrades or a major transformers downgrade, so these were not applied automatically. The critical reports include protobufjs and tinypool; review the current `npm audit` output before deployment and do not expose development/test tooling to untrusted clients. Resolving these requires a separately tested dependency migration; advisory counts can change as the registry changes.
