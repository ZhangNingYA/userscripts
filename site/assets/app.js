const grid = document.querySelector('#script-grid');
const count = document.querySelector('#script-count');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

fetch('./catalog.json')
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
    grid.innerHTML = scripts.map((script) => `
      <article class="script-card">
        <span class="script-icon" aria-hidden="true">${escapeHtml(script.name.charAt(0) || 'U')}</span>
        <div class="script-summary">
          <div class="script-title"><h3>${escapeHtml(script.name)}</h3><span class="version">v${escapeHtml(script.version)}</span></div>
          <p>${escapeHtml(script.description)}</p>
        </div>
        <div class="card-actions">
          <a class="secondary-link" href="scripts/${encodeURIComponent(script.slug)}/">Details <span aria-hidden="true">→</span></a>
          <a class="primary-button" href="scripts/${encodeURIComponent(script.slug)}/${encodeURIComponent(script.filename)}"><svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2"/></svg>Install</a>
        </div>
      </article>`).join('');
  })
  .catch((error) => {
    count.textContent = 'Unavailable';
    grid.innerHTML = `<p class="empty-state">The catalog could not be loaded: ${escapeHtml(error.message)}</p>`;
  });
