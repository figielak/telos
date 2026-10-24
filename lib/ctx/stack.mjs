import { detect } from '../detect.mjs';

const RUNTIMES = ['node', 'python'];

/**
 * One live line for bundles and SessionStart; never written to a file (SPEC §4.1).
 * Formats `detect().versions`; it does not parse manifests itself.
 * @param {string} root
 * @param {{ stack: string[] }} cfg
 * @param {import('../detect.mjs').Detection} [detection]
 * @returns {string} e.g. `Stack: astro 5 · typescript 5.6 · node >=22`
 */
export function stackLine(root, cfg, detection = detect(root)) {
  const { versions } = detection;
  const label = (id) => (versions[id] ? `${id} ${versions[id]}` : id);
  const parts = cfg.stack.map(label);
  for (const runtime of RUNTIMES) {
    if (versions[runtime] && !cfg.stack.includes(runtime)) parts.push(label(runtime));
  }
  return cfg.stack.length ? `Stack: ${parts.join(' · ')}` : 'Stack: unknown';
}
