import { core } from './core.mjs';
import { advanced } from './advanced.mjs';

/**
 * Guide record contract (documented in website/DESIGN.md, "Guide pages").
 *
 * {
 *   slug:          'skill-<name>' | 'cli-<name>', unique, URL safe; the prefix equals `kind`
 *   kind:          'skill' | 'cli'
 *   name:          heading, e.g. '/telos:status'
 *   invocation:    exact syntax, e.g. '/telos:status' or '/telos:plan <request>'
 *   summary:       one sentence for the index and the page description
 *   profiles:      which profiles may run it
 *   prerequisites: string[]
 *   explanation:   string[] (paragraphs)
 *   effects:       string[] (what it reads, writes, commits)
 *   examples:      { title, command, outcome }[] (command is shown as text, outcome is prose)
 *   use, avoid:    string[]
 *   alternatives:  { label, note, slug? }[] (slug links to another record)
 *   sources:       { label, path }[] (repository paths, linked on GitHub)
 *   variants?:     { id, name, invocation, summary, notes: string[] }[]   (e.g. -lite, -hard)
 *   subcommands?:  { id, name, invocation, summary, notes: string[] }[]   (CLI actions, ctx bundles)
 * }
 */
export const REPO = 'https://github.com/figielak/telos';
export const sourceUrl = (path) => `${REPO}/blob/HEAD/${path}`;

export const commands = [...core, ...advanced];

export const groups = [
  { kind: 'skill', id: 'skills', title: 'Claude Code skills', blurb: 'Slash commands you type inside Claude Code.' },
  { kind: 'cli', id: 'cli', title: 'Terminal CLI', blurb: 'The deterministic telos command you run in a shell.' },
];

export const bySlug = (slug) => commands.find((c) => c.slug === slug);
export const kindLabel = (kind) => (kind === 'skill' ? 'Claude Code skill' : 'Terminal CLI');
