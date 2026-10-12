// Builds the iOS web bundle into www/: Muriel's desktop frontend + server.js running in-app.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const shim = (n) => join(root, 'mobile', 'shims', `${n}.js`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// server.js requires './platform' and './tools'; on iOS those resolve to the shims.
const swapLocal = {
  name: 'muriel-ios-swaps',
  setup(b) {
    b.onResolve({ filter: /^\.\/(platform|tools)$/ }, (a) => (a.importer.endsWith('server.js') ? { path: shim(a.path.slice(2)) } : undefined));
  },
};

await build({
  entryPoints: [join(root, 'mobile', 'bridge.js')],
  outfile: join(out, 'mobile-bridge.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['safari16'],
  minify: true,
  sourcemap: 'linked',
  legalComments: 'none',
  alias: {
    fs: shim('fs'), http: shim('http'), https: shim('https'), child_process: shim('child_process'),
    os: shim('os'), url: shim('url'), string_decoder: shim('string_decoder'), crypto: shim('crypto'),
    electron: shim('electron'), path: 'path-browserify', events: 'events', buffer: 'buffer',
  },
  inject: [join(root, 'mobile', 'globals.js')],
  define: { 'process.env.NODE_ENV': '"production"', 'require.main': 'undefined' },
  plugins: [swapLocal],
  logLevel: 'warning',
});

for (const f of ['app.js', 'styles.css', 'audio-engine.js']) cpSync(join(root, f), join(out, f));
cpSync(join(root, 'assets'), join(out, 'assets'), { recursive: true });
cpSync(join(root, 'mobile', 'mobile.css'), join(out, 'mobile.css'));
cpSync(join(root, 'mobile', 'mobile-ui.js'), join(out, 'mobile-ui.js'));

let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html
  .replace('<meta name="viewport"', '<meta name="viewport-desktop"')
  .replace('<head>', '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">')
  .replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css">\n  <link rel="stylesheet" href="mobile.css">')
  .replace('<script src="audio-engine.js"></script>', '<script src="mobile-bridge.js"></script>\n  <script src="audio-engine.js"></script>')
  .replace('<script src="app.js"></script>', '<script src="app.js"></script>\n  <script src="mobile-ui.js"></script>');
writeFileSync(join(out, 'index.html'), html);
console.log('www/ ready');
