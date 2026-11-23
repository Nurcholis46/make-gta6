// Sunset Bay — the hand-in program for the make.fun "Make GTA 6" bounty
// (Node 22, standard library only). The game is plain static files in game/:
// game/index.html plus its ES modules and a vendored three.js, no build step
// and no network request when it runs. This program copies game/ and
// screenshots/ from beside this file into the output directory and writes
// dossier.json there, the summary the judge reads, using the vendored
// make.fun library. It runs twice and writes identical bytes both times.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes. The other limits refuse an entry the scorer would refuse — more than
// 4 screenshots, or one over 256 KiB; more than 993 files in game/, or 48 MiB
// of game files in all; a path under game/ over 1000 bytes. game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json.
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Walk a directory tree and count files and bytes, so the hand-in can say
// plainly what it is sending before the dossier is built.
function measureTree(root) {
  let files = 0;
  let bytes = 0;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const info = statSync(path);
      if (info.isDirectory()) stack.push(path);
      else {
        files += 1;
        bytes += info.size;
      }
    }
  }
  return { files, bytes };
}

function main() {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const gameDir = join(here, 'game');
  const shotsDir = join(here, 'screenshots');

  if (!existsSync(gameDir)) throw new Error(`game/ is missing beside main.ts (${gameDir})`);
  if (!existsSync(join(gameDir, 'index.html'))) throw new Error('game/index.html is missing: the entry has no game to open');

  const gameSize = measureTree(gameDir);
  if (gameSize.files > DOSSIER_LIMITS.game_max_files) {
    throw new Error(`game/ has ${gameSize.files} files, over the ${DOSSIER_LIMITS.game_max_files} cap`);
  }
  if (gameSize.bytes > DOSSIER_LIMITS.game_max_bytes) {
    throw new Error(`game/ is ${gameSize.bytes} bytes, over the ${DOSSIER_LIMITS.game_max_bytes} cap`);
  }

  const shots = existsSync(shotsDir)
    ? readdirSync(shotsDir).filter((name) => /\.(png|jpe?g)$/i.test(name)).sort()
    : [];
  if (shots.length === 0) throw new Error('screenshots/ is empty: the judge needs real renders of the game');
  if (shots.length > DOSSIER_LIMITS.screenshots.max) {
    throw new Error(`${shots.length} screenshots, over the ${DOSSIER_LIMITS.screenshots.max} cap`);
  }
  for (const name of shots) {
    const size = statSync(join(shotsDir, name)).size;
    if (size > DOSSIER_LIMITS.screenshots.max_bytes) {
      throw new Error(`screenshots/${name} is ${size} bytes, over the ${DOSSIER_LIMITS.screenshots.max_bytes} cap`);
    }
  }

  mkdirSync(out, { recursive: true });
  cpSync(gameDir, join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

  writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_LIMITS));

  const done = measureTree(out);
  console.log(
    `Sunset Bay handed in: ${gameSize.files} game files (${gameSize.bytes} bytes), ` +
    `${shots.length} screenshots, ${done.files} files in ${out} (${done.bytes} bytes).`,
  );
}

main();
