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
    count.textContent = `${scripts.length} 个维护中的脚本`;
    if (!scripts.length) {
      grid.innerHTML = '<p class="empty-state">脚本正在整理中。</p>';
      return;
    }
    grid.innerHTML = scripts.map((script) => `
      <article class="script-card">
        <div class="card-top"><span class="script-icon">${escapeHtml(script.name.charAt(0) || 'U')}</span><span class="version">v${escapeHtml(script.version)}</span></div>
        <div><h3>${escapeHtml(script.name)}</h3><p>${escapeHtml(script.description)}</p></div>
        <div class="card-actions"><a class="primary-button" href="scripts/${encodeURIComponent(script.slug)}/${encodeURIComponent(script.filename)}">安装</a><a class="secondary-link" href="scripts/${encodeURIComponent(script.slug)}/">查看详情 →</a></div>
      </article>`).join('');
  })
  .catch((error) => {
    count.textContent = '目录读取失败';
    grid.innerHTML = `<p class="empty-state">暂时无法读取脚本：${escapeHtml(error.message)}</p>`;
  });

