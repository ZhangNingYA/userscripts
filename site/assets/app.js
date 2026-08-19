const grid = document.querySelector('#script-grid');
const count = document.querySelector('#script-count');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const catalogUrl = new URL('./catalog.json', window.location.href);
catalogUrl.searchParams.set('v', String(Date.now()));

fetch(catalogUrl, { cache: 'no-store' })
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((scripts) => {
    count.textContent = `${scripts.length} ${scripts.length === 1 ? 'script' : 'scripts'}`;
    if (!scripts.length) {
      grid.innerHTML = '<p class="empty-state">No scripts have been published yet.</p>';
      return;
    }
    grid.innerHTML = scripts.map((script, index) => {
      const target = script.targets && script.targets[0];
      const extraTargets = Math.max(0, (script.targets?.length || 0) - 1);
      const targetLink = target
        ? `<a class="script-site-link" href="${escapeHtml(target.url)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(target.display || target.hostname)}</span>${extraTargets ? `<small>+${extraTargets} sites</small>` : ''}<span aria-hidden="true">↗</span></a>`
        : '';
      return `
      <article class="script-entry">
        <span class="script-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
        <div class="script-summary">
          <p class="script-meta">Userscript <span aria-hidden="true">/</span> v${escapeHtml(script.version)}</p>
          <h3><a href="scripts/${encodeURIComponent(script.slug)}/?v=${encodeURIComponent(script.version)}">${escapeHtml(script.name)}</a></h3>
          <p>${escapeHtml(script.description)}</p>
          ${targetLink}
        </div>
        <div class="entry-actions">
          <a class="secondary-link" href="scripts/${encodeURIComponent(script.slug)}/?v=${encodeURIComponent(script.version)}">Details <span aria-hidden="true">→</span></a>
          <a class="primary-button" href="scripts/${encodeURIComponent(script.slug)}/${encodeURIComponent(script.filename)}?v=${encodeURIComponent(script.version)}">Install</a>
        </div>
      </article>`;
    }).join('');
  })
  .catch((error) => {
    count.textContent = 'Unavailable';
    grid.innerHTML = `<p class="empty-state">The catalog could not be loaded: ${escapeHtml(error.message)}</p>`;
  });
