import { phaseReport } from './check.mjs';

// Bundle for /telos:done (SPEC §5): the check report plus close verdict, decision promotion
// state, recorded HISTORY entries and the commit policy. A done phase refuses, so a rerun
// never duplicates history. Read-only.

export const doneBundle = (ctx) => phaseReport(ctx, { close: true });
