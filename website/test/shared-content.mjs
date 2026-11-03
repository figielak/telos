import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readDist, siteRoot } from './helpers.mjs';

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'" };

/** Visible text of a built page: scripts, styles and tags removed, entities decoded. */
export function builtText(page = 'index.html') {
  return readDist(page)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(lt|gt|amp|quot|#39);/g, (m) => ENTITIES[m])
    .replace(/\s+/g, ' ')
    .trim();
}

const FILLER = /\b(elevate[ds]?|seamless(ly)?|unleash(es|ed)?|next-gen(eration)?|faster|cheaper|saves?|saving|cost nothing)\b/i;

/** Content rules shared by every section test (D-02, D-03). Returns a list of violations. */
export function contentViolations(text) {
  const out = [];
  for (const name of new Set([...text.matchAll(/\/telos:([a-z][a-z-]*)/g)].map((m) => m[1]))) {
    if (!existsSync(join(siteRoot, '..', 'skills', name))) out.push(`unknown command /telos:${name}`);
  }
  const emoji = text.match(/\p{Extended_Pictographic}/u);
  if (emoji) out.push(`emoji ${emoji[0]}`);
  const figure = text.match(/[%×]/);
  if (figure) out.push(`figure ${figure[0]}`);
  const filler = FILLER.exec(text);
  if (filler) out.push(`banned wording "${filler[0]}"`);
  return out;
}
