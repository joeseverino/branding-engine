// Remove a build directory (default dist) on any platform, so a rebuild never
// ships a file whose source was deleted.
import { rmSync } from 'node:fs';

rmSync(process.argv[2] ?? 'dist', { recursive: true, force: true });
