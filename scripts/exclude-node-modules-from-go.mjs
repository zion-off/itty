import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

writeFileSync(join(import.meta.dirname, '..', 'node_modules', 'go.mod'), 'module itty-web-node-modules\n');
