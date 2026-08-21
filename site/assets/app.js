const grid = document.querySelector('#script-grid');
const count = document.querySelector('#script-count');
const publishedCount = document.querySelector('#published-count');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const cleanTargetDisplay = (value) => String(value ?? '')
  .replace(/\/\*+$/, '')
  .replace(/\*+$/, '')
  .replace(/\/$/, '');

const catalogUrl = new URL('./catalog.json', window.location.href);
catalogUrl.searchParams.set('v', String(Date.now()));

fetch(catalogUrl, { cache: 'no-store' })
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((scripts) => {
    const formattedCount = String(scripts.length).padStart(2, '0');
    count.textContent = formattedCount;
    publishedCount.textContent = `${formattedCount} scripts`;
    if (!scripts.length) {
      grid.innerHTML = '<p class="empty-state">No scripts yet.</p>';
      return;
    }
    grid.innerHTML = scripts.map((script, index) => {
      const target = script.targets && script.targets[0];
      const extraTargets = Math.max(0, (script.targets?.length || 0) - 1);
      const detailUrl = `scripts/${encodeURIComponent(script.slug)}/?v=${encodeURIComponent(script.version)}`;
      const targetLink = target
        ? `<a class="script-site-link" href="${escapeHtml(target.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cleanTargetDisplay(target.display || target.hostname))}</a>${extraTargets ? `<span class="extra-sites">+${extraTargets} sites</span>` : ''}`
        : '';
      return `
      <article class="script-entry accent-${(index % 3) + 1}">
        <span class="script-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
        <div class="script-summary">
          <div class="script-meta"><span>v${escapeHtml(script.version)}</span><time>Updated ${escapeHtml(script.updatedAt)}</time>${targetLink}</div>
          <h3><a href="${detailUrl}">${escapeHtml(script.name)}</a></h3>
          <p>${escapeHtml(script.description)}</p>
        </div>
        <div class="entry-actions">
          <a class="secondary-button" href="${detailUrl}">Details</a>
          <a class="primary-button" href="scripts/${encodeURIComponent(script.slug)}/${encodeURIComponent(script.filename)}?v=${encodeURIComponent(script.version)}">Install</a>
        </div>
      </article>`;
    }).join('');
  })
  .catch((error) => {
    count.textContent = 'Unavailable';
    publishedCount.textContent = '--';
    grid.innerHTML = '<p class="empty-state">Catalog unavailable.</p>';
    console.error(error);
  });
