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
    support: first('supportURL'),
    catalogHidden: first('catalog').toLowerCase() === 'hidden'
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
  const replacementNotice = script.catalogHidden && script.homepage
    ? `<p class="detail-lede">This legacy script remains available for existing installations. <a href="${escapeHtml(script.homepage)}">Use Google News Navigator for the unified reader.</a></p>`
    : '';
  const primaryAction = script.catalogHidden && script.homepage
    ? `<a class="primary-button" href="${escapeHtml(script.homepage)}">Open replacement</a>`
    : `<a class="primary-button" href="./${encodeURIComponent(script.filename)}">Install .user.js</a>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${escapeHtml(script.description)}">
  <title>${escapeHtml(script.name)} - Userscripts</title>
  <link rel="stylesheet" href="../../assets/styles.css?v=3">
</head>
<body>
  <header class="topbar"><div class="topbar-inner"><a class="wordmark" href="../../"><span class="brand-mark" aria-hidden="true">Z</span><span>ZhangNingYA</span><span class="wordmark-section">/ Userscripts</span></a><a class="quiet-link" href="https://github.com/ZhangNingYA/userscripts">Repository <span aria-hidden="true">↗</span></a></div></header>
  <main class="page-shell detail-shell">
    <a class="back-link" href="../../"><span aria-hidden="true">←</span> All scripts</a>
    <article class="detail-article">
      <header class="detail-heading">
        <p class="section-label">Userscript <span aria-hidden="true">/</span> Version ${escapeHtml(script.version)}</p>
        <h1>${escapeHtml(script.name)}</h1>
        <p class="detail-lede">${escapeHtml(script.description)}</p>
        ${replacementNotice}
        <div class="detail-actions">
          ${primaryAction}
          <a class="text-download" href="./${encodeURIComponent(script.textFilename)}" download="${escapeHtml(script.textFilename)}"><span class="file-badge" aria-hidden="true">TXT</span>Download plain text</a>
        </div>
      </header>
      <div class="detail-grid">
        <section><h2>Runs on</h2><ul class="match-list">${matchRows}</ul></section>
        <section><h2>Files</h2><dl class="file-list"><div><dt>Userscript</dt><dd><a href="./${encodeURIComponent(script.filename)}">${escapeHtml(script.filename)}</a></dd></div><div><dt>Plain text</dt><dd><a href="./${encodeURIComponent(script.textFilename)}" download="${escapeHtml(script.textFilename)}">${escapeHtml(script.textFilename)}</a></dd></div></dl></section>
        <section><h2>Updates</h2><p>Your userscript manager checks the published version automatically through the script's update URL.</p></section>
      </div>
    </article>
  </main>
  <footer><span>Maintained by ZhangNingYA</span><span>Public source, no embedded secrets</span></footer>
</body>
</html>`;
}

await rm(outputRoot, { recursive: true, force: true });
await cp(siteRoot, outputRoot, { recursive: true });

const catalog = [];
let builtCount = 0;
const folders = (await readdir(scriptsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name));

for (const folder of folders) {
  const sourceFolder = path.join(scriptsRoot, folder.name);
  const files = (await readdir(sourceFolder)).filter((file) => file.endsWith('.user.js'));
  if (files.length !== 1) throw new Error(`${folder.name} must contain exactly one .user.js file`);
  const filename = files[0];
  const textFilename = filename.replace(/\.user\.js$/, '.txt');
  const sourceFile = path.join(sourceFolder, filename);
  execFileSync(process.execPath, ['--check', sourceFile], { stdio: 'inherit' });
  const metadata = parseMetadata(await readFile(sourceFile, 'utf8'));
  if (!metadata.name || !metadata.version || !metadata.description) throw new Error(`${filename} is missing required metadata`);
  const script = { slug: folder.name, filename, textFilename, ...metadata };
  builtCount += 1;
  const targetFolder = path.join(outputRoot, 'scripts', folder.name);
  await mkdir(targetFolder, { recursive: true });
  await copyFile(sourceFile, path.join(targetFolder, filename));
  await copyFile(sourceFile, path.join(targetFolder, textFilename));
  await writeFile(path.join(targetFolder, 'index.html'), detailPage(script));
  if (!script.catalogHidden) {
    const { catalogHidden: _catalogHidden, ...publicScript } = script;
    catalog.push(publicScript);
  }
}

await writeFile(path.join(outputRoot, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Built ${builtCount} userscripts (${catalog.length} in catalog) into ${outputRoot}`);
