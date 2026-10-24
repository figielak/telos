import { readFileSync } from 'node:fs';

const DIR = new URL('../templates/', import.meta.url);

/**
 * Render `templates/<name>` by replacing `{{key}}` with `vars[key]`. No logic, no escaping.
 * @param {string} name template file name, e.g. `STATUS.md`
 * @param {Record<string, string | number>} vars
 * @throws {Error} when the template uses a variable missing from `vars`
 */
export function render(name, vars) {
  const text = readFileSync(new URL(name, DIR), 'utf8');
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    if (!Object.hasOwn(vars, key)) throw new Error(`template ${name}: missing variable '${key}'`);
    return String(vars[key]);
  });
}
