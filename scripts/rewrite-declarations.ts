// tsc rewrites `.ts` import specifiers to `.js` in emitted JavaScript but leaves
// them in the .d.ts files. Consumers resolve declarations next to the .js, so
// point those specifiers at `.js` too.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'dist');
const specifier = /((?:from\s+|import\()(['"]))(\.{1,2}\/[^'"]+)\.ts\2/g;

let rewritten = 0;
for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.d.ts')) continue;
  const file = path.join(entry.parentPath, entry.name);
  const before = readFileSync(file, 'utf8');
  const after = before.replace(specifier, '$1$3.js$2');
  if (after !== before) {
    writeFileSync(file, after);
    rewritten++;
  }
}
console.log(`Rewrote declaration imports in ${rewritten} files.`);
