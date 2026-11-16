// EMBERLINE — a round-based tactical FPS entry for make.fun (Node 22, stdlib only).
// —
// This program assembles the bundle the judge reads. The game itself lives in the
// game/ folder next to this file: plain static files the browser loads as ES modules,
// with three.js supplied through an import map. All this script does is copy game/
// and screenshots/ into the output directory and write dossier.json, the summary the
// scorer reads, using the vendored make.fun library.
// —
// The kit starter shipped a grey room, one rifle and four targets that fall when shot.
// This entry replaces that with a full Counter-Strike-style match — map, two sites,
// bot teammates and defenders, an economy, a buy phase, planting and defusing — while
// the assembly step below keeps doing the same job, rewritten for this entry.
// —
// Screenshots go in screenshots/ as PNG or JPEG (the first by name is the cover).
// Serve the game for a quick look with `node serve.ts`, then open http://localhost:8080.
// When run outside the grader container, MAKEFUN_OUTPUT_DIR takes the place of /output.
// Run it like this after creating the folder:
//   mkdir -p out
//   MAKEFUN_OUTPUT_DIR=out node main.ts

import {
  cpSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { join as joinPath } from 'node:path';
import { fileURLToPath as urlToPath } from 'node:url';
import { buildDossier as makeDossier } from './vendor/makefun-threejs.ts';

// The scorer's own caps (reference/gate.json). Only text_max_bytes shapes the
// dossier bytes; the rest refuse an entry the scorer would refuse: at most 4
// screenshots, none over 256 KiB; at most 993 files in game/, at most 48 MiB of
// game files in total. game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

const sourceDir = urlToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(from: string, to: string): void {
  cpSync(from, to, { recursive: true });
}

function copyFolderIfPresent(name: string): void {
  const source = joinPath(sourceDir, name);
  if (existsSync(source)) {
    copyTree(source, joinPath(outputDir, name));
  }
}

// Assemble the bundle in order: the game first, then an empty screenshots slot,
// then the screenshots when the folder exists, and finally the dossier that
// describes everything now sitting in the output directory.
mkdirSync(outputDir, { recursive: true });
copyTree(joinPath(sourceDir, 'game'), joinPath(outputDir, 'game'));
mkdirSync(joinPath(outputDir, 'screenshots'), { recursive: true });
copyFolderIfPresent('screenshots');

const dossier = makeDossier(outputDir, DOSSIER_CAPS);
writeFileSync(joinPath(outputDir, 'dossier.json'), dossier);
