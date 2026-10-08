// tsc rewrites `.ts` import specifiers to `.js` in emitted JavaScript but leaves
// them in the .d.ts files. Consumers resolve declarations next to the .js, so
// point those specifiers at `.js` too.
import { globSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'dist');
const specifier = /((?:from\s+|import\()(['"]))(\.{1,2}\/[^'"]+)\.ts\2/g;

let rewritten = 0;
for (const name of globSync('**/*.d.ts', { cwd: root })) {
  const file = path.join(root, name);
  const before = readFileSync(file, 'utf8');
  const after = before.replace(specifier, '$1$3.js$2');
  if (after !== before) {
    writeFileSync(file, after);
    rewritten++;
  }
}
console.log(`Rewrote declaration imports in ${rewritten} files.`);
