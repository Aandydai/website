// Site-wide search functionality
(function() {
  // ========== Styles ==========
  var style = document.createElement('style');
  style.textContent =
    '#search-btn { background: none; border: none; cursor: pointer; padding: 0; color: var(--accent); flex-shrink: 0; display: flex; align-items: center; }' +
    '#search-btn:hover { color: var(--primary); }' +
    '#search-btn svg { display: block; width: 18px; height: 18px; pointer-events: none; }' +
    '#search-btn-wrap { display: flex; align-items: center; margin-left: auto; }' +
    '#search-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 999; display: none; align-items: flex-start; justify-content: center; padding-top: 80px; }' +
    '#search-overlay.open { display: flex; }' +
    '#search-box { background: #fff; border-radius: 8px; width: 560px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; }' +
    '#search-input-wrap { display: flex; align-items: center; padding: 16px 20px; border-bottom: 1px solid #eee; gap: 12px; }' +
    '#search-input { flex: 1; border: none; outline: none; font-size: 18px; font-family: inherit; background: transparent; }' +
    '#search-input::placeholder { color: #aaa; }' +
    '#search-close-btn { background: none; border: none; font-size: 20px; cursor: pointer; color: #999; padding: 0; line-height: 1; }' +
    '#search-close-btn:hover { color: #333; }' +
    '#search-results { max-height: 420px; overflow-y: auto; }' +
    '.search-result-item { display: flex; align-items: center; gap: 12px; padding: 12px 20px; text-decoration: none; color: inherit; border-bottom: 1px solid #f5f5f5; transition: background 0.15s; }' +
    '.search-result-item:last-child { border-bottom: none; }' +
    '.search-result-item:hover { background: #f9f9f9; }' +
    '.search-result-meta { font-size: 12px; color: #aaa; white-space: nowrap; }' +
    '.search-result-title { font-size: 15px; font-weight: 500; color: #333; }' +
    '.search-result-category { font-size: 12px; color: #999; margin-top: 2px; }' +
    '.search-result-arrow { margin-left: auto; color: #ccc; font-size: 14px; }' +
    '#search-empty { padding: 32px 20px; text-align: center; color: #999; font-size: 14px; }' +
    '#search-hint { padding: 12px 20px; text-align: center; color: #ccc; font-size: 13px; }';
  document.head.appendChild(style);

  // ========== Modal HTML ==========
  var modal = document.createElement('div');
  modal.id = 'search-overlay';
  modal.innerHTML =
    '<div id="search-box">' +
      '<div id="search-input-wrap">' +
        '<input type="text" id="search-input" placeholder="Search posts..." autocomplete="off">' +
        '<button id="search-close-btn" type="button">✕</button>' +
      '</div>' +
      '<div id="search-results">' +
        '<div id="search-hint">Type to search articles...</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  // ========== Search functions (defined early) ==========
  function openSearch(prefill) {
    modal.classList.add('open');
    setTimeout(function() {
      var inp = document.getElementById('search-input');
      if (inp) { inp.focus(); if (prefill) { inp.value = prefill; inp.dispatchEvent(new Event('input')); } }
    }, 50);
  }

  function closeSearch() {
    modal.classList.remove('open');
  }

  function escapeHtml(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function doSearch(q) {
    var resultsEl = document.getElementById('search-results');
    resultsEl.innerHTML = '<div id="search-hint">Searching...</div>';
    fetch('/api/search?q=' + encodeURIComponent(q))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.results || data.results.length === 0) {
          resultsEl.innerHTML = '<div id="search-empty">No results for "<strong>' + escapeHtml(q) + '</strong>"</div>';
          return;
        }
        resultsEl.innerHTML = '';
        data.results.forEach(function(post) {
          var a = document.createElement('a');
          a.href = '/post/' + post.slug;
          a.className = 'search-result-item';
          a.addEventListener('click', closeSearch);
          a.innerHTML =
            '<div>' +
              '<div class="search-result-title">' + escapeHtml(post.title) + '</div>' +
              '<div class="search-result-category">' + escapeHtml(post.category) + '</div>' +
            '</div>' +
            '<div class="search-result-meta">' + post.created_at + '</div>' +
            '<div class="search-result-arrow">→</div>';
          resultsEl.appendChild(a);
        });
      })
      .catch(function() {
        resultsEl.innerHTML = '<div id="search-empty">Search failed. Try again.</div>';
      });
  }

  // ========== Event listeners ==========
  document.getElementById('search-close-btn').addEventListener('click', closeSearch);

  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeSearch();
  });

  var input = document.getElementById('search-input');
  var searchTimeout = null;
  input.addEventListener('input', function() {
    clearTimeout(searchTimeout);
    var q = input.value.trim();
    if (!q) {
      document.getElementById('search-results').innerHTML = '<div id="search-hint">Type to search articles...</div>';
      return;
    }
    searchTimeout = setTimeout(function() { doSearch(q); }, 250);
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeSearch();
  });

  // ========== Inject search button into nav ==========
  var navRight = document.querySelector('.nav .nav-right');
  if (navRight) {
    var wrap = document.createElement('div');
    wrap.id = 'search-btn-wrap';
    wrap.innerHTML = '<button id="search-btn" type="button" title="Search (/)">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>' +
      '</button>';
    navRight.appendChild(wrap);
    document.getElementById('search-btn').addEventListener('click', function() { openSearch(); });
  }

  // ========== Subtitle image click ==========
  var subtitles = document.querySelectorAll('.site-subtitle');
  for (var i = 0; i < subtitles.length; i++) {
    subtitles[i].style.cursor = 'pointer';
    subtitles[i].addEventListener('click', function() { openSearch(); });
  }

  // ========== Keyboard shortcuts ==========
  document.addEventListener('keydown', function(e) {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey &&
        document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      openSearch();
    }
    if (e.key === 'Escape' && modal.classList.contains('open')) {
      closeSearch();
    }
  });

  // Expose globally
  window.openSearch = openSearch;
  window.closeSearch = closeSearch;
})();
