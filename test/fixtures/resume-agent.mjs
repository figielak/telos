// Stub agent for the resume-test suites: reads the prompt on stdin and answers from what the
// working copy holds, in Claude Code stream-json. `sleep` hangs; `text` prints plain text;
// `fail` exits 3.
import { existsSync, readFileSync } from 'node:fs';

const mode = process.argv[2] ?? 'json';
if (mode === 'sleep') setTimeout(() => {}, 60_000);
else {
  let input = '';
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', () => {
    const agents = existsSync('AGENTS.md') ? readFileSync('AGENTS.md', 'utf8') : '';
    const facts = [
      existsSync('.telos/STATUS.md') ? 'memory: next is 15-02' : 'no memory',
      existsSync('.telos/resume-test.md') ? 'questions visible' : 'questions hidden',
      agents.includes('telos:start') ? 'rules block' : 'no rules block',
      `asked: ${input.split('\n')[0]}`,
    ].join('\n');
    if (mode === 'fail') { process.stderr.write('stub failed\n'); process.exit(3); }
    if (mode === 'text') { process.stdout.write(`${facts}\n`); return; }
    const event = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
    event({ type: 'system', subtype: 'init' });
    event({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Read' }] } });
    event({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Read' }, { type: 'tool_use', id: 't2', name: 'Grep' }] } });
    event({ type: 'assistant', message: { content: [{ type: 'text', text: facts }] } });
    event({ type: 'result', subtype: 'success', is_error: false, result: facts, total_cost_usd: 0.25,
      usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 300, cache_read_input_tokens: 4000 } });
  });
}
