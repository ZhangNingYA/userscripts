import { execFileSync } from 'node:child_process';
import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptsRoot = path.join(root, 'scripts');
const siteRoot = path.join(root, 'site');
const outputRoot = path.join(root, 'dist');

function parseMetadata(source) {
  const block = source.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);
  if (!block) throw new Error('Missing userscript metadata block');
  const metadata = {};
  for (const line of block[1].split(/\r?\n/)) {
    const match = line.match(/^\/\/\s+@(\S+)\s+(.+?)\s*$/);
    if (!match) continue;
    const [, key, value] = match;
    metadata[key] ??= [];
    metadata[key].push(value);
  }
  const first = (key, fallback = '') => metadata[key]?.[0] || fallback;
  return {
    name: first('name:en', first('name')),
    version: first('version'),
    description: first('description:en', first('description')),
    author: first('author', 'ZhangNingYA'),
    matches: metadata.match || [],
    homepage: first('homepageURL'),
    support: first('supportURL')
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function detailPage(script) {
  const matchRows = script.matches.length
    ? script.matches.map((match) => `<li><code>${escapeHtml(match)}</code></li>`).join('')
    : '<li>No URL patterns declared</li>';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${escapeHtml(script.description)}">
  <title>${escapeHtml(script.name)} - Userscripts</title>
  <link rel="stylesheet" href="../../assets/styles.css?v=2">
</head>
<body>
  <header class="topbar"><div class="topbar-inner"><a class="wordmark" href="../../"><span class="brand-mark" aria-hidden="true">Z</span><span>ZhangNingYA</span><span class="wordmark-section">/ Userscripts</span></a><a class="quiet-link" href="https://github.com/ZhangNingYA/userscripts">Repository <span aria-hidden="true">↗</span></a></div></header>
  <main class="page-shell detail-shell">
    <a class="back-link" href="../../"><span aria-hidden="true">←</span> All scripts</a>
    <section class="detail-summary">
      <span class="script-icon detail-icon" aria-hidden="true">${escapeHtml(script.name.charAt(0) || 'U')}</span>
      <div class="detail-heading"><p class="section-label">Userscript · v${escapeHtml(script.version)}</p><h1>${escapeHtml(script.name)}</h1><p>${escapeHtml(script.description)}</p></div>
      <a class="primary-button" href="./${encodeURIComponent(script.filename)}"><svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2"/></svg>Install script</a>
    </section>
    <section class="detail-grid">
      <article><h2>Runs on</h2><ul class="match-list">${matchRows}</ul></article>
      <article><h2>Updates</h2><p>Your userscript manager checks this script version automatically. You can also run a manual update check from the extension menu.</p></article>
    </section>
  </main>
  <footer><span>Maintained by ZhangNingYA</span><span>Public source, no embedded secrets</span></footer>
</body>
</html>`;
}

await rm(outputRoot, { recursive: true, force: true });
await cp(siteRoot, outputRoot, { recursive: true });

const catalog = [];
const folders = (await readdir(scriptsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name));

for (const folder of folders) {
  const sourceFolder = path.join(scriptsRoot, folder.name);
  const files = (await readdir(sourceFolder)).filter((file) => file.endsWith('.user.js'));
  if (files.length !== 1) throw new Error(`${folder.name} must contain exactly one .user.js file`);
  const filename = files[0];
  const sourceFile = path.join(sourceFolder, filename);
  execFileSync(process.execPath, ['--check', sourceFile], { stdio: 'inherit' });
  const metadata = parseMetadata(await readFile(sourceFile, 'utf8'));
  if (!metadata.name || !metadata.version || !metadata.description) throw new Error(`${filename} is missing required metadata`);
  const script = { slug: folder.name, filename, ...metadata };
  const targetFolder = path.join(outputRoot, 'scripts', folder.name);
  await mkdir(targetFolder, { recursive: true });
  await copyFile(sourceFile, path.join(targetFolder, filename));
  await writeFile(path.join(targetFolder, 'index.html'), detailPage(script));
  catalog.push(script);
}

await writeFile(path.join(outputRoot, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Built ${catalog.length} userscript${catalog.length === 1 ? '' : 's'} into ${outputRoot}`);
