const grid = document.querySelector('#script-grid');
const count = document.querySelector('#script-count');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const scriptVisual = (slug, detailUrl) => `
  <a class="script-visual script-visual-${encodeURIComponent(slug)}" href="${detailUrl}" tabindex="-1" aria-hidden="true"></a>`;

const catalogUrl = new URL('./catalog.json', window.location.href);
catalogUrl.searchParams.set('v', String(Date.now()));

fetch(catalogUrl, { cache: 'no-store' })
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((scripts) => {
    count.textContent = String(scripts.length);
    if (!scripts.length) {
      grid.innerHTML = '<p class="empty-state">No scripts yet.</p>';
      return;
    }
    grid.innerHTML = scripts.map((script) => {
      const target = script.targets && script.targets[0];
      const extraTargets = Math.max(0, (script.targets?.length || 0) - 1);
      const detailUrl = `scripts/${encodeURIComponent(script.slug)}/?v=${encodeURIComponent(script.version)}`;
      const targetLink = target
        ? `<a class="script-site-link" href="${escapeHtml(target.url)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(target.display || target.hostname)}</span>${extraTargets ? `<small>+${extraTargets}</small>` : ''}<span aria-hidden="true">↗</span></a>`
        : '';
      return `
      <article class="script-entry">
        ${scriptVisual(script.slug, detailUrl)}
        <div class="script-summary">
          <p class="script-meta">v${escapeHtml(script.version)}</p>
          <h3><a href="${detailUrl}">${escapeHtml(script.name)}</a></h3>
          <p>${escapeHtml(script.description)}</p>
          ${targetLink}
        </div>
        <div class="entry-actions">
          <a class="secondary-button" href="${detailUrl}">Details <span aria-hidden="true">→</span></a>
          <a class="primary-button" href="scripts/${encodeURIComponent(script.slug)}/${encodeURIComponent(script.filename)}?v=${encodeURIComponent(script.version)}">Install <span aria-hidden="true">↓</span></a>
        </div>
      </article>`;
    }).join('');
  })
  .catch((error) => {
    count.textContent = 'Unavailable';
    grid.innerHTML = '<p class="empty-state">Catalog unavailable.</p>';
    console.error(error);
  });
