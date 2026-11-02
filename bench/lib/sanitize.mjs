// Redaction of published evidence (PROTOCOL §10): transcripts, patches and grading output. Typed placeholders replace
// text only; digits and JSON structure are never touched, so metrics recompute from the published rows.

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MIN_USER = 3;
/** Shortest names (`ab`) would hit ordinary words; they are only removed inside paths. */
const SECRETS = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g, /sk-[A-Za-z0-9]{20,}/g, /gh[pousr]_[A-Za-z0-9]{20,}/g, /github_pat_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g, /xox[baprs]-[A-Za-z0-9-]{10,}/g, /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g,
];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/**
 * Redact `text` → `{ text, hits }` with the hit count per rule (`workdir`, `home`, `home_other`, `email`, `secret`,
 * `user`; rules without a hit are absent). `workDir` and `home` are absolute paths, `user` the OS user name.
 * Order matters: the longest path first, e-mail before the user name so addresses are one hit.
 */
export function sanitize(text, { home, user, workDir } = {}) {
  const hits = {};
  const sub = (rule, re, to) => { text = text.replace(re, () => { hits[rule] = (hits[rule] ?? 0) + 1; return to; }); };
  const path = (value) => new RegExp(`${escape(value.replace(/\/+$/, ''))}(?![A-Za-z0-9_-])`, 'g');
  if (workDir) sub('workdir', path(workDir), '<WORKDIR>');
  if (home) sub('home', path(home), '<HOME>');
  sub('home_other', /(?<=\/(?:home|Users)\/)(?!<)[A-Za-z0-9._-]+/g, '<USER>');
  sub('email', EMAIL, '<EMAIL>');
  for (const re of SECRETS) sub('secret', re, '<SECRET>');
  if (user && user.length >= MIN_USER) sub('user', new RegExp(`(?<![A-Za-z0-9_-])${escape(user)}(?![A-Za-z0-9_-])`, 'g'), '<USER>');
  return { text, hits };
}

/** `sanitize` per line of a JSONL text; a line that parsed before must still parse after. Hits are summed. */
export function sanitizeJsonl(text, ctx) {
  const hits = {};
  const out = text.split('\n').map((line) => {
    if (!line) return line;
    const r = sanitize(line, ctx);
    for (const [k, v] of Object.entries(r.hits)) hits[k] = (hits[k] ?? 0) + v;
    let before = true;
    try { JSON.parse(line); } catch { before = false; }
    if (before) { try { JSON.parse(r.text); } catch { throw new Error('sanitize: redaction would break a JSONL line'); } }
    return r.text;
  });
  return { text: out.join('\n'), hits };
}
