// ========== Home: Load post list ==========
async function loadPosts(page = 1) {
  const res = await fetch(`/api/posts?page=${page}`);
  const data = await res.json();

  const listEl = document.getElementById('post-list');
  listEl.innerHTML = '';

  if (data.posts.length === 0) {
    listEl.innerHTML = '<p style="text-align:center;color:#999;padding:40px 0;">No posts yet.</p>';
    return;
  }

  for (const post of data.posts) {
    const item = document.createElement('div');
    item.className = 'post-item';

    if (post.hasPassword) {
      item.innerHTML = `
        <h2 class="post-title"><a href="/post/${post.slug}">${post.title}</a></h2>
        <div class="post-meta">
          Category: <a href="#">${post.category}</a> &nbsp;&middot;&nbsp; ${post.created_at}
        </div>
        <div class="post-protected">&#128274; Password protected</div>
      `;
    } else {
      item.innerHTML = `
        <h2 class="post-title"><a href="/post/${post.slug}">${post.title}</a></h2>
        <div class="post-meta">
          Category: <a href="#">${post.category}</a> &nbsp;&middot;&nbsp; ${post.created_at} &nbsp;&middot;&nbsp; <a href="/post/${post.slug}#comments">${post.comment_count || 0} comments</a>
        </div>
        <div class="post-preview">${escapeHtml(post.content_preview || post.content)}</div>
      `;
    }

    listEl.appendChild(item);
  }

  renderPagination(data.page, data.totalPages);
}

// ========== Render pagination ==========
function renderPagination(current, total) {
  const pagEl = document.getElementById('pagination');
  if (!pagEl || total <= 1) { pagEl && (pagEl.innerHTML = ''); return; }

  let html = '';

  if (current > 1) {
    html += `<a href="#" onclick="loadPosts(${current - 1}); return false;">Prev</a>`;
  }

  for (let i = 1; i <= total; i++) {
    if (i === current) {
      html += `<span class="current">${i}</span>`;
    } else {
      html += `<a href="#" onclick="loadPosts(${i}); return false;">${i}</a>`;
    }
  }

  if (current < total) {
    html += `<a href="#" onclick="loadPosts(${current + 1}); return false;">Next</a>`;
  }

  pagEl.innerHTML = html;
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
    document.getElementById('page-content').innerHTML = data.content_html;
  }
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

// ========== Page init ==========
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;

  if (path === '/' || path === '/index.html') {
    loadPosts(1);
  } else if (path === '/about') {
    loadAbout();
  } else if (path === '/link') {
    loadFriends();
  } else if (path === '/archive') {
    loadArchive();
  } else if (path.startsWith('/post/')) {
    const slug = path.replace('/post/', '');
    loadPost(slug);
  } else if (path === '/admin') {
    fetch('/api/admin/stats').then(res => {
      if (res.ok) window.location.href = '/admin/dashboard';
    }).catch(() => {});
  } else if (path === '/admin/dashboard') {
    loadDashboardStats();
  }
});