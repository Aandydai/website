// ========== Home: Load post list ==========
async function loadPosts(page = 1) {
  try {
    const res = await fetch(`/api/posts?page=${page}`);
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();

    const listEl = document.getElementById('post-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!data.posts || data.posts.length === 0) {
      listEl.innerHTML = '<p style="text-align:center;color:#999;padding:40px 0;">No posts yet.</p>';
      renderPagination(data.page || page, data.totalPages || 1);
      window.scrollTo(0, 0);
      return;
    }

    for (const post of data.posts) {
      const item = document.createElement('div');
      item.className = 'post-item reveal';

      const preview = escapeHtml((post.content_preview || '').replace(/\s+/g, ' ').trim());
      const previewHtml = preview ? '；<span class="post-preview">' + preview + '</span>' : '';
      if (post.hasPassword) {
        item.innerHTML = `
          <p class="post-text">
            <a class="post-title" href="/post/${post.slug}" target="_blank">${post.title}</a><span class="post-detail">；
            <span class="post-meta">Category: <a href="#">${post.category}</a> &nbsp;&middot;&nbsp; ${post.created_at}</span>；
            <span class="post-protected">&#128274; Password protected</span></span>
          </p>
        `;
      } else {
        item.innerHTML = `
          <p class="post-text">
            <a class="post-title" href="/post/${post.slug}" target="_blank">${post.title}</a><span class="post-detail">；
            <span class="post-meta">Category: <a href="#">${post.category}</a> &nbsp;&middot;&nbsp; ${post.created_at} &nbsp;&middot;&nbsp; <a href="/post/${post.slug}#comments">${post.comment_count || 0} comments</a></span>${previewHtml}</span>
          </p>
        `;
      }

      item.addEventListener('click', function(e) {
        if (e.target.closest('a')) return;
        window.open('/post/' + post.slug, '_blank');
      });

      listEl.appendChild(item);
    }

    if (window.revealObserve) window.revealObserve();

    renderPagination(data.page, data.totalPages);
    window.scrollTo(0, 0);
  } catch (err) {
    console.error('loadPosts error:', err);
    const listEl = document.getElementById('post-list');
    if (listEl) {
      listEl.innerHTML = '<p style="text-align:center;color:#c00;padding:40px 0;">Failed to load posts. Please try again.</p>';
    }
    const pagEl = document.getElementById('pagination');
    if (pagEl) pagEl.innerHTML = '';
  }
}

// ========== Render pagination ==========
function renderPagination(current, total) {
  const pagEl = document.getElementById('pagination');
  if (!pagEl || total <= 1) { if (pagEl) pagEl.innerHTML = ''; return; }

  let html = '';

  if (current > 1) {
    html += `<a href="javascript:void(0)" data-page="${current - 1}">Prev</a>`;
  }

  for (let i = 1; i <= total; i++) {
    if (i === current) {
      html += `<span class="current">${i}</span>`;
    } else {
      html += `<a href="javascript:void(0)" data-page="${i}">${i}</a>`;
    }
  }

  if (current < total) {
    html += `<a href="javascript:void(0)" data-page="${current + 1}">Next</a>`;
  }

  pagEl.innerHTML = html;

  // Attach event listeners (more reliable than inline onclick)
  pagEl.querySelectorAll('a[data-page]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var page = parseInt(this.getAttribute('data-page'));
      if (page) loadPosts(page);
    });
  });
}

// ========== Post detail ==========
async function loadPost(slug) {
  const res = await fetch(`/api/posts/${slug}`);
  const data = await res.json();

  if (res.status === 404) {
    window.location.href = '/404.html';
    return;
  }

  document.getElementById('post-title').textContent = data.title;
  document.getElementById('post-meta').innerHTML = `
    Category: <a href="#">${data.category}</a> &nbsp;&middot;&nbsp; ${data.created_at}
    ${data.views ? ' &nbsp;&middot;&nbsp; ' + data.views + ' views' : ''}
  `;

  if (data.content_html) {
    document.getElementById('post-content').innerHTML = data.content_html;
    document.getElementById('post-body').style.display = '';
    document.getElementById('password-form').style.display = 'none';
    loadComments(data.id);
  } else if (data.needPassword) {
    document.getElementById('post-body').style.display = 'none';
    document.getElementById('password-form').style.display = '';
    document.getElementById('password-slug').value = slug;
  }
}

// ========== Verify post password ==========
async function verifyPassword() {
  const slug = document.getElementById('password-slug').value;
  const password = document.getElementById('password-input').value;

  const res = await fetch(`/api/posts/${slug}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });

  const data = await res.json();

  if (res.status === 401) {
    document.getElementById('password-error').textContent = data.error || 'Wrong password';
    document.getElementById('password-error').style.display = 'block';
    return;
  }

  document.getElementById('post-title').textContent = data.title;
  document.getElementById('post-meta').innerHTML = `
    Category: <a href="#">${data.category}</a> &nbsp;&middot;&nbsp; ${data.created_at}
  `;
  document.getElementById('post-content').innerHTML = data.content_html;
  document.getElementById('post-body').style.display = '';
  document.getElementById('password-form').style.display = 'none';

  loadComments(data.id);
}

// ========== Comments ==========
async function loadComments(postId) {
  const res = await fetch(`/api/posts/${document.querySelector('[data-slug]')?.dataset.slug || window.location.pathname.split('/').pop()}`);
  const data = await res.json();

  const commentsList = document.getElementById('comments-list');
  const titleEl = document.getElementById('comments-title');

  if (!data.comments || data.comments.length === 0) {
    commentsList.innerHTML = '<p style="color:#999;">No comments yet. Say something.</p>';
    titleEl.textContent = 'No comments';
    return;
  }

  titleEl.textContent = `${data.comments.length} comments`;
  commentsList.innerHTML = '';

  for (const c of data.comments) {
    const item = document.createElement('div');
    item.className = 'comment-item';
    item.innerHTML = `
      <div class="comment-meta">
        <strong>${escapeHtml(c.author)}</strong> &nbsp;&middot;&nbsp; ${c.created_at}
      </div>
      <div class="comment-content">${escapeHtml(c.content).replace(/\n/g, '<br>')}</div>
    `;
    commentsList.appendChild(item);
  }
}

async function submitComment(postId) {
  const author = document.getElementById('comment-author').value.trim();
  const email = document.getElementById('comment-email').value.trim();
  const content = document.getElementById('comment-content').value.trim();

  if (!author || !email || !content) {
    alert('Please fill in name, email and comment.');
    return;
  }

  const slug = window.location.pathname.replace('/post/', '');
  const postRes = await fetch(`/api/posts/${slug}`);
  const postData = await postRes.json();

  const res = await fetch('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      post_id: postData.id,
      author,
      email,
      url: document.getElementById('comment-url')?.value || '',
      content
    })
  });

  if (res.ok) {
    document.getElementById('comment-content').value = '';
    loadPost(slug);
  }
}

// ========== About page ==========
async function loadAbout() {
  const res = await fetch('/api/about');
  const data = await res.json();

  if (data.content_html) {
    document.getElementById('about-body').innerHTML = data.content_html;
  }

  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = 'About - promise';
  document.title = 'About - promise';
}

// ========== Friends page ==========
async function loadFriends() {
  const res = await fetch('/api/friends');
  const data = await res.json();

  const listEl = document.getElementById('friends-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (data.friends.length === 0) {
    listEl.innerHTML = '<p style="color:#999;">No friends yet.</p>';
    return;
  }

  for (const f of data.friends) {
    const card = document.createElement('div');
    card.className = 'friend-card';
    card.innerHTML = `
      <h3><a href="${f.url}" target="_blank">${escapeHtml(f.name)}</a></h3>
      <p>${escapeHtml(f.description || '')}</p>
    `;
    listEl.appendChild(card);
  }
}

// ========== Archive page ==========
async function loadArchive() {
  const res = await fetch('/api/archive');
  const data = await res.json();

  const listEl = document.getElementById('archive-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  for (const [month, posts] of Object.entries(data.archive)) {
    const group = document.createElement('div');
    group.className = 'archive-group';
    group.innerHTML = `<h3>${month}</h3>`;

    for (const post of posts) {
      const item = document.createElement('div');
      item.className = 'archive-item';
      item.innerHTML = `
        <span class="date">${post.created_at}</span>
        <a href="/post/${post.slug}">${post.title}</a>
      `;
      group.appendChild(item);
    }

    listEl.appendChild(group);
  }
}

// ========== Categories page ==========
async function loadCategories() {
  document.getElementById('categories-heading').textContent = 'Categories';
  document.getElementById('back-link').style.display = 'none';

  const res = await fetch('/api/categories');
  const data = await res.json();

  const listEl = document.getElementById('categories-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (!data.categories || data.categories.length === 0) {
    listEl.innerHTML = '<p style="color:#999;">No categories yet.</p>';
    return;
  }

  for (const c of data.categories) {
    const card = document.createElement('div');
    card.className = 'friend-card';
    card.style.cursor = 'pointer';
    card.innerHTML = '<h3>' + escapeHtml(c.name) + '</h3><p>' + (c.post_count || 0) + ' posts</p>';
    card.addEventListener('click', function() { loadCategoryPosts(c.name); });
    listEl.appendChild(card);
  }

  // Add Vocabulary card after categories (display only, nav bar handles navigation)
  var vocabCard = document.createElement('div');
  vocabCard.className = 'friend-card';
  vocabCard.innerHTML = '<h3>Vocabulary</h3><p>英语考试大纲3500词</p>';
  listEl.appendChild(vocabCard);
}

async function loadCategoryPosts(categoryName) {
  const listEl = document.getElementById('categories-list');
  if (!listEl) return;
  listEl.innerHTML = '<p style="color:#999;">Loading posts in <strong>' + escapeHtml(categoryName) + '</strong>...</p>';

  fetch('/api/posts?category=' + encodeURIComponent(categoryName))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      document.getElementById('categories-heading').textContent = categoryName;
      var backEl = document.getElementById('back-link');
      backEl.style.display = 'inline';
      backEl.innerHTML = '<a href="#" id="back-to-cats" style="color:var(--link);font-size:14px;">&larr; Back to all</a>';
      document.getElementById('back-to-cats').addEventListener('click', function(e) { e.preventDefault(); loadCategories(); });

      if (!data.posts || data.posts.length === 0) {
        listEl.innerHTML = '<p style="color:#999;">No posts in this category yet.</p>';
        return;
      }
      var html = '';
      for (var i = 0; i < data.posts.length; i++) {
        var p = data.posts[i];
        html += '<div class="post-item">' +
          '<h2 class="post-title"><a href="/post/' + p.slug + '">' + escapeHtml(p.title) + '</a></h2>' +
          '<div class="post-meta">' + escapeHtml(p.category) + ' &nbsp;&middot;&nbsp; ' + p.created_at + '</div>' +
          '<div class="post-preview">' + escapeHtml(p.content_preview || '') + '</div></div>';
      }
      listEl.innerHTML = html;
    });
}

// ========== Admin: Login ==========
async function adminLogin(username, password) {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();

  if (res.ok) {
    window.location.href = '/admin/dashboard';
  } else {
    document.getElementById('login-error').textContent = data.error || 'Login failed';
    document.getElementById('login-error').style.display = 'block';
  }
}

function adminLogout() {
  fetch('/api/admin/logout', { method: 'POST' }).then(() => {
    window.location.href = '/admin';
  });
}

// ========== Dashboard: Load stats ==========
async function loadDashboardStats() {
  const res = await fetch('/api/admin/stats');
  const data = await res.json();

  document.getElementById('stat-posts').textContent = data.postCount;
  document.getElementById('stat-comments').textContent = data.commentCount;
  document.getElementById('stat-friends').textContent = data.friendCount;

  const listEl = document.getElementById('recent-comments');
  if (listEl) {
    listEl.innerHTML = '';
    for (const c of data.recentComments) {
      const item = document.createElement('div');
      item.className = 'comment-item';
      item.innerHTML = `
        <div class="comment-meta">
          <strong>${escapeHtml(c.author)}</strong> commented on <a href="/post/${c.post_slug}" target="_blank">${escapeHtml(c.post_title)}</a> &nbsp;&middot;&nbsp; ${c.created_at}
        </div>
        <div class="comment-content">${escapeHtml(c.content)}</div>
      `;
      listEl.appendChild(item);
    }
  }
}

// ========== Footer ==========
function loadFooter() {
  fetch('/api/settings')
    .then(r => r.json())
    .then(data => {
      const el = document.getElementById('footer-info');
      if (!el) return;
      let html = '© promise';
      if (data.settings && data.settings.icp) {
        html += ` | <a href="https://beian.miit.gov.cn" target="_blank">${escapeHtml(data.settings.icp)}</a>`;
      }
      if (data.settings && data.settings.gongan) {
        const gonganDigits = (data.settings.gongan.match(/\d+/g) || []).join('');
        const searchUrl = gonganDigits
          ? `https://beian.mps.gov.cn/#/query/webSearch?keyword=${gonganDigits}`
          : 'https://beian.mps.gov.cn/#/query/webSearch';
        html += ` | <a href="${searchUrl}" target="_blank">${escapeHtml(data.settings.gongan)}</a>`;
      }
      el.innerHTML = html;
    })
    .catch(() => {});
}

// ========== Utilities ==========
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ========== Back to Top ==========
const backToTopBtn = document.getElementById('back-to-top');
if (backToTopBtn) {
  window.addEventListener('scroll', () => {
    backToTopBtn.classList.toggle('visible', window.scrollY > 200);
  });
  backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ========== Theme ==========
(function() {
  var saved = localStorage.getItem('theme');
  if (saved === 'dark') document.documentElement.dataset.theme = 'dark';
})();

function toggleTheme() {
  var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
  var btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = next === 'dark' ? '☀' : '☾';
}

// ========== Page init ==========
document.addEventListener('DOMContentLoaded', () => {
  loadFooter();

  // Inject theme toggle
  var navRight = document.querySelector('.nav .nav-right');
  if (navRight) {
    var btn = document.createElement('button');
    btn.id = 'theme-toggle';
    btn.className = 'nav-icon';
    btn.textContent = document.documentElement.dataset.theme === 'dark' ? '☀' : '☾';
    btn.title = 'Toggle dark mode';
    btn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:1em;padding:0;color:var(--accent)';
    btn.addEventListener('click', toggleTheme);
    navRight.appendChild(btn);

    // 登录入口（主题切换右边）
    var loginEl = document.createElement('a');
    loginEl.id = 'login-entry';
    loginEl.href = '/login';
    loginEl.textContent = 'login';
    loginEl.style.cssText = 'text-decoration:none;color:var(--accent);font-size:1em;';
    navRight.appendChild(loginEl);

    fetch('/api/user/me')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.loggedIn) {
          loginEl.textContent = '👤 ' + data.name;
          loginEl.href = '#';
          loginEl.title = '退出登录';
          loginEl.addEventListener('click', function(e) {
            e.preventDefault();
            fetch('/api/user/logout', { method: 'POST' }).then(function() {
              window.location.reload();
            });
          });
        }
      })
      .catch(function() {});
  }

  const path = window.location.pathname;

  if (path === '/' || path === '/index.html' || path === '/posts') {
    loadPosts(1);
  } else if (path === '/about') {
    loadAbout();
  } else if (path === '/link' || path === '/links') {
    loadFriends();
  } else if (path === '/archive') {
    loadArchive();
  } else if (path === '/categories') {
    loadCategories();
  } else if (path.startsWith('/post/')) {
    const slug = path.replace('/post/', '');
    loadPost(slug);
    // Init comment form
    const submitBtn = document.getElementById('submit-comment-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const author = document.getElementById('comment-author').value.trim();
        const email = document.getElementById('comment-email').value.trim();
        const content = document.getElementById('comment-content').value.trim();
        if (!author || !email || !content) { alert('Please fill in nickname, email and comment content'); return; }
        fetch('/api/posts/' + slug).then(r => r.json()).then(postData => {
          fetch('/api/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ post_id: postData.id, author, email, url: document.getElementById('comment-url')?.value || '', content })
          }).then(r => r.json()).then(() => {
            document.getElementById('comment-content').value = '';
            loadPost(slug);
          });
        });
      });
    }
    // Password verify button
    const verifyBtn = document.getElementById('verify-password-btn');
    if (verifyBtn) {
      verifyBtn.addEventListener('click', () => { if (typeof verifyPassword === 'function') verifyPassword(); });
    }
    // Enter key on password input
    const passwordInput = document.getElementById('password-input');
    if (passwordInput) {
      passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && typeof verifyPassword === 'function') verifyPassword();
      });
    }
  } else if (path === '/admin') {
    fetch('/api/admin/check').then(r => r.json()).then(data => {
      if (data.loggedIn) window.location.href = '/admin/dashboard';
    }).catch(() => {});
  } else if (path === '/admin/dashboard') {
    loadDashboardStats();
  }
});
