// Mobile navigation: inject a hamburger toggle and collapse the nav into a dropdown
(function() {
  var header = document.querySelector('.header');
  var nav = header ? header.querySelector('.nav') : null;
  if (!header || !nav) return;

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nav-toggle';
  btn.textContent = '☰';
  btn.setAttribute('aria-label', '打开导航菜单');
  btn.setAttribute('aria-expanded', 'false');
  header.appendChild(btn);

  function setState(open) {
    nav.classList.toggle('open', open);
    btn.textContent = open ? '✕' : '☰';
    btn.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  btn.addEventListener('click', function() {
    setState(!nav.classList.contains('open'));
  });

  nav.addEventListener('click', function(e) {
    if (e.target.closest('a')) setState(false);
  });
})();

// Reveal-on-scroll: 元素滚动进入视口时淡入 + 上移
(function() {
  if (!('IntersectionObserver' in window)) return;
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal-in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

  window.revealObserve = function() {
    document.querySelectorAll('.reveal:not(.reveal-in)').forEach(function(el) {
      observer.observe(el);
    });
  };

  // 静态内容区块自动加入渐入（首页文章列表由 app.js 动态添加，这里处理静态页）
  document.querySelectorAll('.page-content, .post-detail').forEach(function(el) {
    el.classList.add('reveal');
  });

  window.revealObserve();
})();
