// `telos resume-test` (phase 15): does a fresh session know the project better, and more
// cheaply, with the memory than without it? Questions live in `.telos/resume-test.md` (D1);
// scoring is a deterministic substring match, never a model judge (D2).

/** Questions file, relative to the repo root. */
export const QUESTIONS_FILE = '.telos/resume-test.md';
export const MIN_QUESTIONS = 5;
export const MAX_QUESTIONS = 10;

const QUESTION = /^-\s+Q:\s*(.*)$/;
const EXPECT = /^\s+expect:\s*(.*)$/;

/** Blank out HTML comments, keeping line breaks so line numbers stay true. */
const stripComments = (text) => text.replace(/<!--[\s\S]*?(?:-->|$)/g, (c) => c.replace(/[^\n]/g, ''));

/**
 * @typedef {{ line: number, q: string, facts: string[][] }} Question
 *   `facts`: every fact must match; each fact is a list of alternatives
 */

/**
 * Parse and validate the questions file: `- Q: <question>`, then `  expect: <fact>; <fact>`
 * on the next non-empty line; `a|b` is one fact with alternatives.
 * @param {string} text
 * @returns {{ questions: Question[], errors: string[] }} errors carry line numbers
 */
export function parseQuestions(text) {
  const questions = [];
  const errors = [];
  let open = null;
  const close = () => {
    if (open) errors.push(`line ${open.line}: question without an expect line`);
    open = null;
  };
  stripComments(text).split('\n').forEach((raw, i) => {
    if (!raw.trim()) return;
    const q = QUESTION.exec(raw);
    const e = EXPECT.exec(raw);
    if (q) {
      close();
      if (!q[1].trim()) errors.push(`line ${i + 1}: empty question`);
      open = { line: i + 1, q: q[1].trim() };
    } else if (e && open) {
      const facts = e[1].split(';')
        .map((f) => f.split('|').map((a) => a.trim()).filter(Boolean))
        .filter((alts) => alts.length);
      if (!facts.length) errors.push(`line ${i + 1}: expect has no fact`);
      else if (open.q) questions.push({ ...open, facts });
      open = null;
    } else if (e) {
      errors.push(`line ${i + 1}: expect without a question`);
    } else {
      close();
    }
  });
  close();
  if (questions.length < MIN_QUESTIONS || questions.length > MAX_QUESTIONS) {
    errors.push(`${questions.length} questions; ${MIN_QUESTIONS}–${MAX_QUESTIONS} needed`);
  }
  return { questions, errors };
}
