const mapPlaces = [
  { slug: 'yunlong-lake', category: 'nature', direction: '西南方向', distance: '约 8 km', duration: '3–5 小时', x: 24, y: 72, labelX: '-50%', labelY: '-185%' },
  { slug: 'xuzhou-museum', category: 'history', direction: '西南方向', distance: '约 4 km', duration: '2–3 小时', x: 37, y: 66, labelX: '-115%', labelY: '-150%' },
  { slug: 'yunlong-mountain', category: 'nature', direction: '西南方向', distance: '约 5 km', duration: '2–3 小时', x: 31, y: 72, labelX: '10%', labelY: '75%' },
  { slug: 'han-culture', category: 'history', direction: '东南方向', distance: '约 5 km', duration: '3–4 小时', x: 66, y: 66, labelX: '10%', labelY: '-145%' },
  { slug: 'guishan-tomb', category: 'history', direction: '西北方向', distance: '约 9 km', duration: '2–3 小时', x: 22, y: 30, labelX: '10%', labelY: '-50%' },
  { slug: 'hubushan', category: 'history', direction: '西南方向', distance: '约 3 km', duration: '2–3 小时', x: 39, y: 63, labelX: '-115%', labelY: '65%' },
  { slug: 'huaihai-memorial', category: 'history', direction: '正南方向', distance: '约 5 km', duration: '2–3 小时', x: 53, y: 76, labelX: '10%', labelY: '50%' },
  { slug: 'baolian-temple', category: 'history', direction: '东北方向', distance: '约 12 km', duration: '1.5–2 小时', x: 73, y: 35, labelX: '10%', labelY: '-50%' },
  { slug: 'xuzhou-paradise', category: 'leisure', direction: '西南方向', distance: '约 12 km', duration: '半天至一天', x: 9, y: 80, labelX: '10%', labelY: '-50%' },
  { slug: 'panan-lake', category: 'nature', direction: '东北远郊', distance: '约 30 km', duration: '半天', x: 88, y: 15, labelX: '-110%', labelY: '65%' }
];

const metroStations = [
  { name: '彭城广场', lines: [1, 2], x: 40, y: 52, labelX: '-105%', labelY: '70%' },
  { name: '民主北路', lines: [1], x: 46, y: 52, labelX: '-105%', labelY: '-210%' },
  { name: '子房山', lines: [1], x: 59, y: 52, labelX: '-50%', labelY: '65%' },
  { name: '黄山垅', lines: [1], x: 68, y: 52, labelX: '-50%', labelY: '-210%' },
  { name: '户部山', lines: [2], x: 43, y: 61, labelX: '-115%', labelY: '-50%' },
  { name: '和平大桥', lines: [3], x: 52, y: 64, labelX: '20%', labelY: '-50%' },
  { name: '淮塔', lines: [2, 3], x: 48, y: 73, labelX: '-115%', labelY: '45%' },
  { name: '徐州东站', lines: [1, 6], x: 83, y: 52, labelX: '-50%', labelY: '-210%', hub: true }
];

const commerceCenters = [
  { slug: 'golden-eagle', x: 36, y: 43, side: 'left' },
  { slug: 'suning-plaza', x: 44, y: 42, side: 'right' },
  { slug: 'yunlong-wanda', x: 67, y: 43, side: 'left' },
  { slug: 'global-harbor', x: 78, y: 43, side: 'right' },
  { slug: 'mixc-city-plaza', x: 74, y: 85, side: 'right' }
];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function metroTemplate(station) {
  const lineChips = station.lines.map((line) => `<i class="line-chip line-${line}">${line}</i>`).join('');
  return `
    <div class="metro-station${station.hub ? ' is-hub' : ''}" style="--x:${station.x}%;--y:${station.y}%;--label-x:${station.labelX};--label-y:${station.labelY}" aria-label="${escapeHtml(station.name)}，地铁${station.lines.join('、')}号线">
      <span class="station-dot" aria-hidden="true"></span>
      <span class="station-name">${lineChips}<strong>${escapeHtml(station.name)}</strong></span>
    </div>`;
}

function spotMarkerTemplate(spot, place) {
  return `
    <button class="spot-marker" type="button" data-place="${escapeHtml(place.slug)}" style="--x:${spot.x}%;--y:${spot.y}%;--label-x:${spot.labelX || '10%'};--label-y:${spot.labelY || '-50%'}" aria-label="打开景点：${escapeHtml(place.name)}">
      <span class="marker-label">${escapeHtml(place.name)}</span>
    </button>`;
}

function commerceTemplate(center, place) {
  return `
    <button class="commerce-marker label-${center.side}" type="button" data-place="${escapeHtml(place.slug)}" style="--x:${center.x}%;--y:${center.y}%" aria-label="打开商圈：${escapeHtml(place.name)}">
      <span class="commerce-name">${escapeHtml(place.name)}</span>
    </button>`;
}

const stationRoot = document.querySelector('#metro-stations');
if (stationRoot) stationRoot.innerHTML = metroStations.map(metroTemplate).join('');

const dialog = document.querySelector('#place-dialog');
const lastTrigger = { element: null };
const dialogFields = {
  image: document.querySelector('#dialog-image'),
  caption: document.querySelector('#dialog-caption'),
  category: document.querySelector('#dialog-category'),
  title: document.querySelector('#dialog-title'),
  summary: document.querySelector('#dialog-summary'),
  direction: document.querySelector('#dialog-direction'),
  duration: document.querySelector('#dialog-duration'),
  link: document.querySelector('#dialog-link')
};

function closeDialog() {
  if (!dialog) return;
  if (dialog.open) dialog.close();
  document.body.classList.remove('dialog-open');
  lastTrigger.element?.focus();
}

function openDialog(place, trigger) {
  if (!dialog || !place) return;
  lastTrigger.element = trigger;
  dialogFields.image.src = `./assets/images/${encodeURIComponent(place.image)}`;
  dialogFields.image.alt = place.imageAlt || place.name;
  dialogFields.caption.textContent = place.imageCaption || '';
  dialogFields.category.textContent = `${place.kind === 'commerce' ? '商圈' : '景点'} · ${place.category}`;
  dialogFields.title.textContent = place.name;
  dialogFields.summary.textContent = place.summary;
  dialogFields.direction.textContent = place.direction;
  dialogFields.duration.textContent = place.duration;
  dialogFields.link.href = `./places/${encodeURIComponent(place.slug)}/`;
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
  document.body.classList.add('dialog-open');
}

function showLoadError() {
  const status = document.querySelector('#load-status');
  if (!status) return;
  status.hidden = false;
  status.textContent = '地点资料暂时无法加载，请刷新页面重试。';
}

async function initMap() {
  const markerRoot = document.querySelector('#map-markers');
  const commerceRoot = document.querySelector('#commerce-markers');
  try {
    const response = await fetch('./assets/places.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`places.json: ${response.status}`);
    const places = await response.json();
    const bySlug = new Map(places.map((place) => [place.slug, place]));
    markerRoot.innerHTML = mapPlaces.map((spot) => {
      const place = bySlug.get(spot.slug);
      return place ? spotMarkerTemplate(spot, place) : '';
    }).join('');
    commerceRoot.innerHTML = commerceCenters.map((center) => {
      const place = bySlug.get(center.slug);
      return place ? commerceTemplate(center, place) : '';
    }).join('');
    document.querySelectorAll('[data-place]').forEach((trigger) => {
      trigger.addEventListener('click', () => openDialog(bySlug.get(trigger.dataset.place), trigger));
    });
  } catch (error) {
    console.error(error);
    showLoadError();
  }
}

document.querySelector('.dialog-close')?.addEventListener('click', closeDialog);
dialog?.addEventListener('click', (event) => {
  if (event.target === dialog) closeDialog();
});
dialog?.addEventListener('close', () => {
  document.body.classList.remove('dialog-open');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && dialog?.open) closeDialog();
});

initMap();
