/**
 * Bundles the server into a single CommonJS file `dist/server-bundle.cjs`.
 *
 * Strategy:
 * - Entry: src/index.ts
 * - Platform: node, target: node20 (SEA-friendly, compatible with ≥20)
 * - Native modules (better-sqlite3) are marked external so their `.node`
 *   addon can be loaded at runtime from a sibling folder. This is the only
 *   sane way to ship SQLite without rebuilding node-gyp on each host.
 *
 * Output structure after packaging/build-release.ps1:
 *   release/
 *     mycrm-server.exe        (or node.exe + server-bundle.cjs)
 *     node_modules/better-sqlite3/  (native .node + tiny JS shim)
 *     drizzle/                 (migration SQL files)
 *     data/                    (empty — created on first boot)
 */
import { build } from 'esbuild';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const outDir = path.join(serverRoot, 'dist');
mkdirSync(outDir, { recursive: true });

const outfile = path.join(outDir, 'server-bundle.cjs');

await build({
  entryPoints: [path.join(serverRoot, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile,
  sourcemap: false,
  minify: false,
  logLevel: 'info',
  banner: {
    // Polyfills for ESM-style `import.meta.url` that some deps use
    js: `const __import_meta_url = require('url').pathToFileURL(__filename).href;`,
  },
  define: {
    'import.meta.url': '__import_meta_url',
  },
  external: [
    // Native modules — must ship as sibling
    'better-sqlite3',
    '@node-rs/argon2',
    '@node-rs/argon2-win32-x64-msvc',
    '@node-rs/argon2-darwin-x64',
    '@node-rs/argon2-linux-x64-gnu',
    // Uses worker_threads with runtime-resolved worker.js paths
    'pino',
    'thread-stream',
    'pino-pretty',
    // Optional / fallback deps that drizzle-kit references but we don't need at runtime
    'pg',
    'mysql2',
    '@libsql/client',
    'bun:sqlite',
  ],
  loader: {
    '.node': 'file',
  },
});

console.log(`✓ bundled → ${path.relative(serverRoot, outfile)}`);

// Also copy drizzle migrations into dist/ so the release assembler picks them up
const migrationsSrc = path.join(serverRoot, 'drizzle');
const migrationsDst = path.join(outDir, 'drizzle');
if (existsSync(migrationsSrc)) {
  mkdirSync(migrationsDst, { recursive: true });
  // shallow recursive copy
  const { cpSync } = await import('node:fs');
  cpSync(migrationsSrc, migrationsDst, { recursive: true });
  console.log(`✓ migrations → ${path.relative(serverRoot, migrationsDst)}`);
}
