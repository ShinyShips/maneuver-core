import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { platform } from 'node:os';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localJavaRoot = join(repoRoot, '.local-tools', 'temurin21-jre');
const javaExecutable = findFile(localJavaRoot, platform() === 'win32' ? 'java.exe' : 'java');

if (!javaExecutable) {
  console.error(
    'Java 21 was not found. Install Java 21 or place a portable JRE under .local-tools/temurin21-jre.'
  );
  process.exit(1);
}

const firebaseExecutable = join(
  repoRoot,
  'node_modules',
  '.bin',
  platform() === 'win32' ? 'firebase.cmd' : 'firebase'
);

if (!existsSync(firebaseExecutable)) {
  console.error('firebase-tools was not found. Run npm install first.');
  process.exit(1);
}

const javaBin = dirname(javaExecutable);
const child = spawn(
  firebaseExecutable,
  ['emulators:start', '--only', 'firestore', '--project', 'maneuver-dev'],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true',
      JAVA_HOME: resolve(javaBin, '..'),
      PATH: `${javaBin}${platform() === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
    },
    stdio: 'inherit',
    shell: platform() === 'win32',
  }
);

child.on('exit', code => {
  process.exit(code ?? 1);
});

function findFile(root, fileName) {
  if (!existsSync(root)) {
    return null;
  }

  for (const entry of readdirSync(root)) {
    const fullPath = join(root, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      const found = findFile(fullPath, fileName);

      if (found) {
        return found;
      }
    } else if (entry === fileName) {
      return fullPath;
    }
  }

  return null;
}
