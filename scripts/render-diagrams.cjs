// Graphviz is an optional system prerequisite; no npm renderer is needed.
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const root = resolve(__dirname, '..');
const diagrams = [
  ['er-chen', 'er-diagram'],
  ['er-people-teams', 'er-people-teams'],
  ['er-players-games', 'er-players-games'],
  ['er-reports-news', 'er-reports-news'],
  ['relational-schema', 'relational-schema'],
];
for (const [source, output] of diagrams) {
  for (const format of ['png', 'svg']) {
    const relational = source === 'relational-schema';
    const command = relational ? 'neato' : 'dot';
    const args = [...(relational ? ['-n2'] : []), `-T${format}`, '-Gdpi=110',
      `docs/diagrams/${source}.dot`, '-o', `docs/${output}.${format}`];
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
    if (result.error || result.status !== 0) {
      console.error(result.error?.message || `${command} exited ${result.status}`);
      console.error('Install Graphviz (macOS: brew install graphviz), then npm run diagrams.');
      process.exit(1);
    }
  }
  console.log(`Rendered docs/${output}.{png,svg}`);
}
