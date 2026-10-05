// Evaluate an expression in the page (test mode) and print the result as JSON.
// node tools/probe.mjs '<expression>' [query]   e.g.  node tools/probe.mjs "window.__perf(1, 30)"
// Module-scope values are reachable through window.__eval('...source...').
import { launch } from './cdp.mjs';

const page = await launch({ query: process.argv[3] || 'test=1&q=high' });
try {
  await page.open();
  console.log(JSON.stringify(await page.evaluate(process.argv[2])));
} catch (e) {
  console.log('EXC', String(e.message).slice(0, 1500));
  console.log(page.logs.slice(-30).join('\n'));
}
await page.close();
process.exit(0);
