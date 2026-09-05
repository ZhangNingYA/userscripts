import { execFileSync } from 'node:child_process';
import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptsRoot = path.join(root, 'scripts');
const siteRoot = path.join(root, 'site');
const outputRoot = path.join(root, 'dist');
const sitePresentation = new Map([
  ['chatgpt.com', { label: 'ChatGPT', url: 'https://chatgpt.com/', display: 'chatgpt.com/*' }],
  ['chat.openai.com', { key: 'chatgpt.com', label: 'ChatGPT', url: 'https://chatgpt.com/', display: 'chatgpt.com/*' }],
  ['news.google.com', { label: 'Google News', url: 'https://news.google.com/home?hl=en-US&gl=US&ceid=US:en', display: 'news.google.com/*' }],
  ['fulafu.com', { label: 'Fulafu Study', url: 'https://www.fulafu.com/study/', display: 'fulafu.com/study/*' }],
  ['reuters.com', { label: 'Reuters', url: 'https://www.reuters.com/' }],
  ['apnews.com', { label: 'AP News', url: 'https://apnews.com/' }],
  ['bbc.com', { label: 'BBC News', url: 'https://www.bbc.com/news' }],
  ['bbc.co.uk', { key: 'bbc.com', label: 'BBC News', url: 'https://www.bbc.com/news' }],
  ['cnn.com', { label: 'CNN', url: 'https://www.cnn.com/' }],
  ['edition.cnn.com', { key: 'cnn.com', label: 'CNN', url: 'https://www.cnn.com/' }],
  ['theguardian.com', { label: 'The Guardian', url: 'https://www.theguardian.com/' }],
  ['nytimes.com', { label: 'The New York Times', url: 'https://www.nytimes.com/' }],
  ['washingtonpost.com', { label: 'The Washington Post', url: 'https://www.washingtonpost.com/' }],
  ['cnbc.com', { label: 'CNBC', url: 'https://www.cnbc.com/' }],
  ['nbcnews.com', { label: 'NBC News', url: 'https://www.nbcnews.com/' }],
  ['cbsnews.com', { label: 'CBS News', url: 'https://www.cbsnews.com/' }],
  ['foxnews.com', { label: 'Fox News', url: 'https://www.foxnews.com/' }],
  ['ptt.cc', { label: 'PTT Gossiping', url: 'https://www.ptt.cc/bbs/Gossiping/index.html', display: 'ptt.cc/bbs/Gossiping/*' }],
  ['media.3go.fun', { key: '3go.fun', label: '3GO', url: 'https://tube.3go.fun/', display: 'tube.3go.fun / media.3go.fun' }],
  ['tube.3go.fun', { key: '3go.fun', label: '3GO', url: 'https://tube.3go.fun/', display: 'tube.3go.fun / media.3go.fun' }],
  ['up.sp2026.com', { key: 'sp2026.com', label: 'SP2026', url: 'https://sp2026.com/', display: 'sp2026.com / up.sp2026.com' }],
  ['sp2026.com', { label: 'SP2026', url: 'https://sp2026.com/', display: 'sp2026.com / up.sp2026.com' }],
  ['91.9p9.xyz', { key: '91porn.com', label: '91Porn', url: 'https://91porn.com/', display: '91porn.com / 9p9.xyz' }],
  ['9p9.xyz', { key: '91porn.com', label: '91Porn', url: 'https://91porn.com/', display: '91porn.com / 9p9.xyz' }],
  ['91porn.com', { label: '91Porn', url: 'https://91porn.com/', display: '91porn.com / 9p9.xyz' }],
  ['laowang.vip', { label: 'Laowang Forum', url: 'https://laowang.vip/', display: 'laowang.vip / alternate domains' }],
  ['laowangopk893.vip', { key: 'laowang.vip', label: 'Laowang Forum', url: 'https://laowang.vip/', display: 'laowang.vip / alternate domains' }],
  ['javhub.net', { label: 'JavHub', url: 'https://javhub.net/', display: 'javhub.net/play/*' }],
  ['ja.javhub.net', { key: 'javhub.net', label: 'JavHub', url: 'https://javhub.net/', display: 'javhub.net/play/*' }],
  ['xasian.org', { label: 'XAsian', url: 'https://xasian.org/', display: 'xasian.org/*' }],
  ['bbav110.com', { key: 'avjb.com', label: 'AVJB Community', url: 'https://bbav110.com/', display: 'bbav110.com / avjb.com' }],
  ['avjb.com', { label: 'AVJB Community', url: 'https://bbav110.com/', display: 'bbav110.com / avjb.com' }]
]);

function titleCaseHostname(hostname) {
  return hostname
    .split('.')[0]
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function cleanTargetDisplay(value) {
  return String(value).replace(/\/\*+$/, '').replace(/\*+$/, '').replace(/\/$/, '');
}

function targetsFromMatches(matches) {
  const targets = new Map();
  for (const match of matches) {
    const hostMatch = String(match).match(/^(?:https?:|\*:)\/\/([^/]+)/i);
    if (!hostMatch) continue;
    const hostname = hostMatch[1].replace(/^\*\./, '').replace(/^www\./, '').toLowerCase();
    const presentation = sitePresentation.get(hostname) || {};
    const key = presentation.key || hostname;
    if (targets.has(key)) continue;
    const url = presentation.url || `https://${hostname}/`;
    const matchPath = String(match).match(/^(?:https?:|\*:)\/\/[^/]+(\/.*)$/i)?.[1] || '/';
    targets.set(key, {
      label: presentation.label || titleCaseHostname(hostname),
      hostname: new URL(url).hostname.replace(/^www\./, ''),
      display: cleanTargetDisplay(presentation.display || `${hostname}${matchPath}`),
      url
    });
  }
  return Array.from(targets.values());
}

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
    updatedAt: first('lastUpdated'),
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

function compactDateTime(value) {
  const match = String(value ?? '').match(/^(\d{2})(\d{2})-(\d{2})-(\d{2}) (\d{2}:\d{2})$/);
  return match ? `${match[2]}/${match[3]}/${match[4]} ${match[5]}` : '';
}

function detailPage(script, index) {
  const versionQuery = `?v=${encodeURIComponent(script.version)}`;
  const siteRows = script.targets.length
    ? script.targets.map((target, targetIndex) => `<li><span class="site-index">${String(targetIndex + 1).padStart(2, '0')}</span><a class="site-link" href="${escapeHtml(target.url)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(target.label)}</strong><small>${escapeHtml(target.display)}</small></a></li>`).join('')
    : '<li>No supported sites declared</li>';
  const primaryTarget = script.targets[0];
  const primarySiteLink = primaryTarget
    ? `<a class="site-button" href="${escapeHtml(primaryTarget.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(primaryTarget.display)}</a>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${escapeHtml(script.description)}">
  <title>${escapeHtml(script.name)} - Userscripts</title>
  <link rel="stylesheet" href="../../assets/styles.css?v=29">
</head>
<body>
  <header class="topbar"><div class="topbar-inner"><a class="wordmark" href="../../"><span class="brand-mark" aria-hidden="true">U</span><strong class="wordmark-title">Userscripts</strong></a><nav class="topnav" aria-label="Primary navigation"><a href="../../#catalog">Scripts</a><a href="https://github.com/ZhangNingYA/userscripts">Source</a></nav></div></header>
  <main class="page-shell detail-shell">
    <a class="back-link" href="../../">All scripts</a>
    <article class="detail-article">
      <header class="detail-heading">
        <p class="eyebrow">Script ${String(index + 1).padStart(2, '0')} / v${escapeHtml(script.version)} / ${escapeHtml(script.updatedAtDisplay)}</p>
        <h1>${escapeHtml(script.name)}</h1>
        <p class="detail-lede">${escapeHtml(script.description)}</p>
        <div class="detail-actions">
          <a class="primary-button" href="./${encodeURIComponent(script.filename)}${versionQuery}">Install</a>
          ${primarySiteLink}
          <a class="text-download" href="./${encodeURIComponent(script.textFilename)}${versionQuery}" download="${escapeHtml(script.textFilename)}">Text copy</a>
        </div>
      </header>
      <div class="detail-grid">
        <section class="runs-on"><div class="section-heading"><h2>Sites</h2><p>${String(script.targets.length).padStart(2, '0')} supported</p></div><ul class="site-list">${siteRows}</ul></section>
        <section><h2>Files</h2><dl class="file-list"><div><dt>Userscript</dt><dd><a href="./${encodeURIComponent(script.filename)}${versionQuery}">${escapeHtml(script.filename)}</a></dd></div><div><dt>Text</dt><dd><a href="./${encodeURIComponent(script.textFilename)}${versionQuery}" download="${escapeHtml(script.textFilename)}">${escapeHtml(script.textFilename)}</a></dd></div></dl></section>
        <section><h2>Release</h2><dl class="file-list"><div><dt>Version</dt><dd>v${escapeHtml(script.version)}</dd></div><div><dt>Date</dt><dd><time class="release-date">${escapeHtml(script.updatedAtDisplay)}</time></dd></div></dl></section>
      </div>
    </article>
  </main>
  <footer><span>Userscripts</span><a href="https://github.com/ZhangNingYA/userscripts">Source</a></footer>
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
  const textFilename = filename.replace(/\.user\.js$/, '.txt');
  const sourceFile = path.join(sourceFolder, filename);
  execFileSync(process.execPath, ['--check', sourceFile], { stdio: 'inherit' });
  const metadata = parseMetadata(await readFile(sourceFile, 'utf8'));
  if (!metadata.name || !metadata.version || !metadata.description || !metadata.updatedAt) throw new Error(`${filename} is missing required metadata`);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(metadata.updatedAt)) {
    throw new Error(`${filename} has an invalid @lastUpdated; expected YYYY-MM-DD HH:mm`);
  }
  const script = { slug: folder.name, filename, textFilename, ...metadata, updatedAtDisplay: compactDateTime(metadata.updatedAt) };
  script.targets = targetsFromMatches(script.matches);
  const targetFolder = path.join(outputRoot, 'scripts', folder.name);
  await mkdir(targetFolder, { recursive: true });
  await copyFile(sourceFile, path.join(targetFolder, filename));
  await copyFile(sourceFile, path.join(targetFolder, textFilename));
  await writeFile(path.join(targetFolder, 'index.html'), detailPage(script, catalog.length));
  catalog.push(script);
}

await writeFile(path.join(outputRoot, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Built ${catalog.length} userscript${catalog.length === 1 ? '' : 's'} into ${outputRoot}`);
