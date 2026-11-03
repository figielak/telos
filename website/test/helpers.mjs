import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
export const distPath = (...p) => join(siteRoot, 'dist', ...p);

export const exists = (path) => existsSync(path);
export const read = (path) => readFileSync(path, 'utf8');
export const readDist = (...p) => read(distPath(...p));
export const readSite = (...p) => read(join(siteRoot, ...p));

/** Every built file of one kind, concatenated (CSS bundles carry content hashes). */
export function distCss() {
  const dir = distPath('_astro');
  if (!existsSync(dir)) return '';
  return readdirSyncSafe(dir).filter((f) => f.endsWith('.css')).map((f) => read(join(dir, f))).join('\n');
}

import { readdirSync } from 'node:fs';
function readdirSyncSafe(dir) {
  return readdirSync(dir);
}

const channel = (v) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG 2.x contrast ratio between two #rrggbb colors. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const TOKENS = {
  bg: '#101114',
  surface: '#1A1C20',
  accent: '#C8A96B',
  text: '#F1EEE6',
  muted: '#A5A29A',
};
