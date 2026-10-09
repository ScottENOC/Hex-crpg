import { execFileSync, spawnSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files', '-z', '--', '*.js'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

if (files.length === 0) {
  console.error('No tracked JavaScript files found.');
  process.exit(1);
}

let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures += 1;
    console.error('\nSyntax check failed: ' + file);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.stdout) process.stdout.write(result.stdout);
  }
}

if (failures) {
  console.error('\nJavaScript syntax check failed for ' + failures + ' of ' + files.length + ' tracked files.');
  process.exit(1);
}
console.log('JavaScript syntax OK: ' + files.length + ' tracked files checked.');
