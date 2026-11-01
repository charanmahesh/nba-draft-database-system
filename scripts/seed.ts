import 'dotenv/config';
import { spawnSync } from 'node:child_process';

const env = { ...process.env, PGHOST: process.env.PG_HOST, PGPORT: process.env.PG_PORT, PGUSER: process.env.PG_USER, PGPASSWORD: process.env.PG_PASSWORD, PGDATABASE: process.env.PG_DATABASE };
for (const name of ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'] as const) {
  if (!env[name]) throw new Error(`Missing database setting: ${name}`);
}
function run(command: string, args: string[]) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const file of ['reset.sql', '00_extensions.sql', '01_schema.sql', '02_alter_demo.sql', '03_views.sql', '04_functions.sql', '05_triggers.sql']) run('psql', ['-v', 'ON_ERROR_STOP=1', '-f', `db/postgres/${file}`]);
for (const file of ['00_staging.sql', '01_load.sql', '02_transform.sql']) run('psql', ['-v', 'ON_ERROR_STOP=1', '-f', `db/import/${file}`]);
run('psql', ['-v', 'ON_ERROR_STOP=1', '-f', 'db/postgres/06_seed.sql']);
for (const script of ['text:generate', 'seed:phase3c']) run('npm', ['run', script]);
