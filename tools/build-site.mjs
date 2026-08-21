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
  ['ptt.cc', { label: 'PTT Gossiping', url: 'https://www.ptt.cc/bbs/Gossiping/index.html', display: 'ptt.cc/bbs/Gossiping/*' }]
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
    const hostMatch = String(match).match(/^https?:\/\/([^/]+)/i);
    if (!hostMatch) continue;
    const hostname = hostMatch[1].replace(/^\*\./, '').replace(/^www\./, '').toLowerCase();
    const presentation = sitePresentation.get(hostname) || {};
    const key = presentation.key || hostname;
    if (targets.has(key)) continue;
    const url = presentation.url || `https://${hostname}/`;
    const matchPath = String(match).match(/^https?:\/\/[^/]+(\/.*)$/i)?.[1] || '/';
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

function tripDetailPage(place, index, total) {
  const typeName = place.kind === 'commerce' ? '商圈' : '景点';
  const highlights = place.highlights.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></li>`).join('');
  const history = place.history.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
  const route = place.route.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const interesting = place.interesting.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const tips = (place.tips || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const sources = (place.sources || []).map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a></li>`).join('');
  const gallery = (place.gallery || []).map((item) => `<figure class="gallery-item">
    <img src="../../assets/images/${encodeURIComponent(item.image)}" alt="${escapeHtml(item.alt)}" loading="lazy" decoding="async">
    <figcaption><strong>${escapeHtml(item.caption)}</strong><a href="${escapeHtml(item.source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.credit)}</a></figcaption>
  </figure>`).join('');
  const cycling = place.cycling ? `<section class="detail-section cycling-section" aria-labelledby="cycling-heading">
    <div class="section-heading-row"><h2 id="cycling-heading">云龙湖骑行攻略</h2><span>路线规划估算</span></div>
    <dl class="cycling-facts">
      <div><dt>核心环线</dt><dd>${escapeHtml(place.cycling.distance)}</dd></div>
      <div><dt>小南湖延伸</dt><dd>${escapeHtml(place.cycling.extendedDistance)}</dd></div>
      <div><dt>建议用时</dt><dd>${escapeHtml(place.cycling.duration)}</dd></div>
      <div><dt>路况强度</dt><dd>${escapeHtml(place.cycling.difficulty)}</dd></div>
    </dl>
    <ol class="cycling-route">${place.cycling.stops.map((stop) => `<li><strong>${escapeHtml(stop.name)}</strong><span>${escapeHtml(stop.note)}</span></li>`).join('')}</ol>
    <p class="cycling-note">${escapeHtml(place.cycling.note)}</p>
    <ul class="tip-list">${place.cycling.safety.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  </section>` : '';
  const practical = [
    ['营业时间', place.hours],
    ['预约与入场', place.booking],
    ['价格参考', place.price],
    ['更实惠的方式', place.saving],
    ['从徐州站出发', place.transport],
    ...(place.officialPhone ? [['咨询电话', place.officialPhone]] : [])
  ].map(([label, value]) => `<li><strong>${escapeHtml(label)}</strong><p>${escapeHtml(value)}</p></li>`).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#f3f5f1">
  <meta name="description" content="${escapeHtml(place.name)}：${escapeHtml(place.summary)}">
  <title>${escapeHtml(place.name)} · 徐州旅行图</title>
  <link rel="stylesheet" href="../../assets/trip.css?v=5">
</head>
<body class="trip-detail">
  <header class="site-header">
    <a class="wordmark" href="../../" aria-label="返回徐州旅行图地图">
      <span class="wordmark-seal" aria-hidden="true">徐</span>
      <span><strong>徐州</strong><small>XUZHOU TRIP</small></span>
    </a>
    <nav class="detail-nav" aria-label="页面导航"><a href="../../#top">回到地图</a><a href="../../places/">地点目录</a></nav>
  </header>

  <main class="detail-main">
    <article>
      <figure class="detail-hero">
        <img src="../../assets/images/${encodeURIComponent(place.image)}" alt="${escapeHtml(place.imageAlt)}" loading="eager" decoding="async">
        <figcaption class="detail-hero-copy">
          <p class="detail-eyebrow">${typeName} · ${escapeHtml(place.category)} · ${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</p>
          <h1>${escapeHtml(place.name)}</h1>
          <p class="detail-lede">${escapeHtml(place.summary)}</p>
        </figcaption>
      </figure>
      <p class="detail-caption">${escapeHtml(place.imageCaption)}</p>
      ${place.verifiedAt ? `<div class="verification-bar"><strong>资料核验：${escapeHtml(place.verifiedAt)}</strong><span>开放与票务可能临时调整，出发当天再点开来源确认一次。</span></div>` : ''}

      <dl class="detail-facts">
        <div class="fact"><dt>方向</dt><dd>${escapeHtml(place.direction)}</dd></div>
        <div class="fact"><dt>建议停留</dt><dd>${escapeHtml(place.duration)}</dd></div>
        <div class="fact"><dt>地点类型</dt><dd>${typeName} · ${escapeHtml(place.category)}</dd></div>
        <div class="fact"><dt>出行方式</dt><dd>地铁 / 打车为主</dd></div>
      </dl>

      <div class="detail-layout">
        <div>
          <section class="detail-section" aria-labelledby="highlights-heading">
            <h2 id="highlights-heading">核心看点</h2>
            <ul class="highlight-list">${highlights}</ul>
          </section>
          <section class="detail-section" aria-labelledby="history-heading">
            <h2 id="history-heading">历史与背景</h2>
            ${history}
          </section>
          <section class="detail-section" aria-labelledby="route-heading">
            <h2 id="route-heading">怎么游 / 怎么逛</h2>
            <ol class="route-list">${route}</ol>
          </section>
          ${cycling}
          ${gallery ? `<section class="detail-section gallery-section" aria-labelledby="gallery-heading"><h2 id="gallery-heading">现场图解</h2><div class="detail-gallery">${gallery}</div></section>` : ''}
        </div>
        <aside class="detail-aside">
          <p class="aside-note"><strong>出发前核对</strong>开放时间、价格、预约规则、活动和交通都可能临时变化。${typeName === '景点' ? '景区当天的入馆、检票和项目开放状态尤其重要。' : '商场的门店营业时间、优惠券和停车规则也可能分别调整。'}出发当天请以官方公告为准。</p>
          <section class="detail-section" aria-labelledby="practical-heading">
            <h2 id="practical-heading">实用信息</h2>
            <ul class="practical-list">${practical}</ul>
          </section>
          <section class="detail-section" aria-labelledby="interesting-heading">
            <h2 id="interesting-heading">有趣的地点</h2>
            <ul class="interesting-list">${interesting}</ul>
          </section>
          ${tips ? `<section class="detail-section" aria-labelledby="tips-heading"><h2 id="tips-heading">现场避坑</h2><ul class="tip-list">${tips}</ul></section>` : ''}
          ${sources ? `<section class="detail-section source-section" aria-labelledby="sources-heading"><h2 id="sources-heading">核验来源</h2><p>更新于 ${escapeHtml(place.verifiedAt || '本次整理')}</p><ul class="source-list">${sources}</ul></section>` : ''}
        </aside>
      </div>

      <p class="image-credit">图片：<a href="${escapeHtml(place.imageSource)}" target="_blank" rel="noopener noreferrer">${escapeHtml(place.imageCredit)}</a>。图片说明和授权信息来自资料页；使用时请以原始页面为准。</p>
    </article>
  </main>
  <footer><strong>徐州旅行图</strong><p>这是个人旅行资料页；示意地图不是导航，运营信息请在出发当天复核。</p></footer>
</body>
</html>`;
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
  <link rel="stylesheet" href="../../assets/styles.css?v=26">
</head>
<body>
  <header class="topbar"><div class="topbar-inner"><a class="wordmark" href="../../"><span class="brand-mark" aria-hidden="true">U</span><strong class="wordmark-title">Userscripts</strong></a><nav class="topnav" aria-label="Primary navigation"><a href="../../#catalog">Scripts</a><a href="https://github.com/ZhangNingYA/userscripts">Source</a></nav></div></header>
  <main class="page-shell detail-shell">
    <a class="back-link" href="../../">All scripts</a>
    <article class="detail-article">
      <header class="detail-heading">
        <p class="eyebrow">Script ${String(index + 1).padStart(2, '0')} / v${escapeHtml(script.version)} / Updated ${escapeHtml(script.updatedAt)}</p>
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
        <section class="update-section"><h2>Updates</h2><p><strong>Last updated</strong><br><time>${escapeHtml(script.updatedAt)}</time></p><p>Checked automatically by your userscript manager.</p></section>
      </div>
    </article>
  </main>
  <footer><span>Userscripts</span><a href="https://github.com/ZhangNingYA/userscripts">Source</a></footer>
</body>
</html>`;
}

await rm(outputRoot, { recursive: true, force: true });
await cp(siteRoot, outputRoot, { recursive: true });

const tripDataFile = path.join(siteRoot, 'trip', 'assets', 'places.json');
let tripPlaces;
try {
  tripPlaces = JSON.parse(await readFile(tripDataFile, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (tripPlaces) {
  if (!Array.isArray(tripPlaces) || tripPlaces.length !== 15) {
    throw new Error('site/trip/assets/places.json must contain exactly 15 places');
  }
  const tripSlugs = new Set();
  for (const place of tripPlaces) {
    if (!place || !/^[a-z0-9-]+$/.test(place.slug) || tripSlugs.has(place.slug)) {
      throw new Error(`Invalid or duplicate trip place slug: ${place?.slug || '(empty)'}`);
    }
    tripSlugs.add(place.slug);
    if (!/^[a-z0-9._-]+$/.test(place.image)) throw new Error(`Invalid trip image filename: ${place.image}`);
    await readFile(path.join(siteRoot, 'trip', 'assets', 'images', place.image));
    for (const key of ['name', 'summary', 'direction', 'duration', 'imageAlt', 'imageCaption', 'imageCredit', 'imageSource', 'hours', 'booking', 'price', 'saving', 'transport']) {
      if (!String(place[key] || '').trim()) throw new Error(`${place.slug} is missing ${key}`);
    }
    for (const key of ['highlights', 'history', 'route', 'interesting']) {
      if (!Array.isArray(place[key]) || place[key].length === 0) throw new Error(`${place.slug} is missing ${key}`);
    }
    for (const item of place.gallery || []) {
      if (!item || !/^[a-z0-9._-]+$/.test(item.image)) throw new Error(`${place.slug} has an invalid gallery image`);
      await readFile(path.join(siteRoot, 'trip', 'assets', 'images', item.image));
      for (const key of ['alt', 'caption', 'credit', 'source']) {
        if (!String(item[key] || '').trim()) throw new Error(`${place.slug} gallery image is missing ${key}`);
      }
    }
  }
  const tripPlacesRoot = path.join(outputRoot, 'trip', 'places');
  await mkdir(tripPlacesRoot, { recursive: true });
  for (const [index, place] of tripPlaces.entries()) {
    const placeRoot = path.join(tripPlacesRoot, place.slug);
    await mkdir(placeRoot, { recursive: true });
    await writeFile(path.join(placeRoot, 'index.html'), tripDetailPage(place, index, tripPlaces.length));
  }
  const tripDirectoryRows = tripPlaces.map((place, index) => `<li><a href="./${encodeURIComponent(place.slug)}/"><span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(place.name)}</strong><small>${escapeHtml(place.kind === 'commerce' ? '商圈' : '景点')} · ${escapeHtml(place.category)}</small></a></li>`).join('');
  await writeFile(path.join(tripPlacesRoot, 'index.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f3f5f1"><title>地点目录 · 徐州旅行图</title><link rel="stylesheet" href="../../assets/trip.css?v=5"></head>
<body class="trip-detail"><header class="site-header"><a class="wordmark" href="../../"><span class="wordmark-seal" aria-hidden="true">徐</span><span><strong>徐州</strong><small>XUZHOU TRIP</small></span></a><nav class="detail-nav" aria-label="页面导航"><a href="../../#top">回到地图</a></nav></header><main class="detail-main"><article><h1>地点目录</h1><p class="detail-lede">从地图标记进入每个景点和商圈的图片资料与行程参考。</p><ul class="interesting-list">${tripDirectoryRows}</ul></article></main><footer><strong>徐州旅行图</strong></footer></body></html>`);
}

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
  const script = { slug: folder.name, filename, textFilename, ...metadata };
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
