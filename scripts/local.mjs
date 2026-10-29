// `npm run local` — runs DMS on your computer with no Firebase project needed.
// 1. Starts the Firebase emulators (local Auth, Firestore and Storage) with the real security rules.
// 2. Loads demo accounts and the starter formats (first run only).
// 3. Starts the app at http://localhost:5173 and opens your browser.
// Data is saved to .emulator-data when you press Ctrl+C, and loaded again next time.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const win = process.platform === 'win32';
const DATA = '.emulator-data';
const children = [];

function start(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { shell: win, ...opts });
  children.push(child);
  return child;
}

const emuArgs = ['-y', 'firebase-tools@15.34.1', 'emulators:start', '--only', 'auth,firestore,storage',
  '--project', 'demo-fts', '--export-on-exit', DATA];
if (existsSync(DATA)) emuArgs.push('--import', DATA);

console.log('\n[DMS] Starting the local Firebase emulators (first run downloads them, ~1 minute)…\n');
const emu = start('npx', emuArgs, { stdio: ['inherit', 'pipe', 'inherit'] });

let ready = false;
emu.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  if (!ready && text.includes('All emulators ready')) {
    ready = true;
    onReady();
  }
});
emu.on('exit', (code) => {
  if (!ready) {
    console.error('\n[DMS] The emulators stopped before they were ready. Is Java 21 or newer installed? Run: java -version');
  }
  children.forEach((c) => c !== emu && c.kill());
  process.exit(code ?? 0);
});

function onReady() {
  const seed = start('node', ['scripts/seed-local.mjs'], { stdio: 'inherit' });
  seed.on('exit', () => {
    console.log('\n[DMS] Starting the app at http://localhost:5173 …\n');
    start('npx', ['vite', '--mode', 'emulator', '--port', '5173', '--open'], { stdio: 'inherit' });
  });
}

// Ctrl+C: stop the app, let the emulators save their data and exit.
process.on('SIGINT', () => {
  console.log('\n[DMS] Stopping… saving local data to .emulator-data');
  children.forEach((c) => c !== emu && c.kill());
});
