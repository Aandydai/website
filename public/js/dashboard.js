(function() {
// ========== Globals ==========
var currentTab = 'posts';
var modalAction = null;
var editingPostId = null;
var editingLinkId = null;
var editingCategoryId = null;
var csrfToken = '';

// ========== Event Delegation (replaces all dynamic onclick) ==========
document.addEventListener('click', function(e) {
  var btn = e.target.closest('button');
  if (!btn) return;

  // Post actions
  var postId = btn.getAttribute('data-edit-post');
  if (postId) { openPostModal(parseInt(postId)); return; }
  postId = btn.getAttribute('data-delete-post');
  if (postId) { deletePost(parseInt(postId)); return; }

  // Link actions
  var linkId = btn.getAttribute('data-edit-link');
  if (linkId) { openLinkModal(parseInt(linkId)); return; }
  linkId = btn.getAttribute('data-delete-link');
  if (linkId) { deleteLink(parseInt(linkId)); return; }

  // Comment actions
  var commentId = btn.getAttribute('data-delete-comment');
  if (commentId) { deleteComment(parseInt(commentId)); return; }

  // Category actions
  var catId = btn.getAttribute('data-edit-category');
  if (catId) { editCategoryModal(parseInt(catId)); return; }
  catId = btn.getAttribute('data-delete-category');
  if (catId) { deleteCategory(parseInt(catId)); return; }

  // User actions
  var userId = btn.getAttribute('data-edit-user');
  if (userId) { openUserEdit(parseInt(userId)); return; }
  userId = btn.getAttribute('data-reset-user');
  if (userId) { resetUserPassword(parseInt(userId)); return; }
  userId = btn.getAttribute('data-delete-user');
  if (userId) { deleteUser(parseInt(userId)); return; }
  if (btn.hasAttribute('data-new-user')) { openAddUser(); return; }
  if (btn.hasAttribute('data-batch-import')) { toggleBatchImport(); return; }
  if (btn.hasAttribute('data-batch-confirm')) { confirmBatchImport(); return; }
  if (btn.hasAttribute('data-batch-cancel')) { toggleBatchImport(); return; }

  // Tab switch
  var tab = btn.getAttribute('data-tab');
  if (tab) { switchTab(tab); return; }

  // Upload triggers
  var uploadType = btn.getAttribute('data-upload');
  if (uploadType) { triggerUpload(uploadType); return; }

  // Video/File link
  if (btn.hasAttribute('data-video-link')) { insertVideoLink(); return; }
  if (btn.hasAttribute('data-file-link')) { insertFileLink(); return; }

  // Static HTML button actions
  if (btn.hasAttribute('data-logout')) { handleLogout(); return; }
  if (btn.hasAttribute('data-new-post')) { openPostModal(); return; }
  if (btn.hasAttribute('data-new-link')) { openLinkModal(); return; }
  if (btn.hasAttribute('data-new-category')) { openCategoryModal(); return; }
  if (btn.hasAttribute('data-save-settings')) { saveSettings(); return; }
  if (btn.hasAttribute('data-change-password')) { changePassword(); return; }
  if (btn.hasAttribute('data-generate-recovery')) { generateRecoveryCodes(); return; }
  if (btn.hasAttribute('data-load-totp')) { loadTotpSetup(); return; }
  if (btn.hasAttribute('data-close-modal')) { closeModal(); return; }
  if (btn.hasAttribute('data-confirm-modal')) { modalConfirm(); return; }
});

// ========== Init ==========
document.addEventListener('DOMContentLoaded', function() {
  fetch('/api/csrf-token')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      csrfToken = data.csrfToken;
      var _origFetch = window.fetch;
      window.fetch = function(url, options) {
        options = options || {};
        if (typeof url === 'string' && url.startsWith('/api/admin') && csrfToken) {
          options.headers = options.headers || {};
          if (!options.headers['X-CSRF-Token']) {
            options.headers['X-CSRF-Token'] = csrfToken;
          }
        }
        return _origFetch(url, options);
      };
    })
    .then(function() { loadDashboardData(); })
    .catch(function() { loadDashboardData(); });
});

// ========== Load Data ==========
function loadDashboardData() {
  fetch('/api/admin/stats')
    .then(function(r) { return r.json(); })
    .then(function(stats) {
      document.getElementById('stat-posts').textContent = stats.postCount;
      document.getElementById('stat-comments').textContent = stats.commentCount;
      document.getElementById('stat-links').textContent = stats.friendCount;

      var rcEl = document.getElementById('recent-comments');
      if (stats.recentComments.length === 0) {
        rcEl.innerHTML = '<p style="color:#999;">No comments yet.</p>';
      } else {
        rcEl.innerHTML = '';
        stats.recentComments.forEach(function(c) {
          var div = document.createElement('div');
          div.className = 'comment-item';
          div.innerHTML = '<div class="comment-meta"><strong>' + escapeHtml(c.author) + '</strong> commented on <a href="/post/' + c.post_slug + '" target="_blank">' + escapeHtml(c.post_title) + '</a> &middot; ' + c.created_at + '</div><div class="comment-content">' + escapeHtml(c.content) + '</div>';
          rcEl.appendChild(div);
        });
      }
      loadPostsTable();
      loadLinksTable();
      loadCommentsTable();
      loadCategoriesTable();
    });
}

function loadPostsTable() {
  fetch('/api/admin/posts')
    .then(function(r) { return r.json(); })
    .then(function(posts) {
      var tbody = document.getElementById('posts-tbody');
      tbody.innerHTML = '';
      posts.forEach(function(p) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + p.id + '</td><td>' + escapeHtml(p.title) + '</td><td>' + escapeHtml(p.slug) + '</td><td>' + escapeHtml(p.category) + '</td><td>' + p.comment_count + '</td><td>' + p.created_at + '</td>' +
          '<td><button class="btn btn-secondary btn-sm" data-edit-post="' + p.id + '">Edit</button> <button class="btn btn-danger btn-sm" data-delete-post="' + p.id + '">Delete</button></td>';
        tbody.appendChild(tr);
      });
    });
}

function loadLinksTable() {
  fetch('/api/admin/friends')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var links = data.friends || [];
      var tbody = document.getElementById('links-tbody');
      tbody.innerHTML = '';
      links.forEach(function(l) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + l.id + '</td><td>' + escapeHtml(l.name) + '</td><td><a href="' + l.url + '" target="_blank">' + escapeHtml(l.url) + '</a></td><td>' + escapeHtml(l.description || '') + '</td><td>' + l.sort_order + '</td>' +
          '<td><button class="btn btn-secondary btn-sm" data-edit-link="' + l.id + '">Edit</button> <button class="btn btn-danger btn-sm" data-delete-link="' + l.id + '">Delete</button></td>';
        tbody.appendChild(tr);
      });
    });
}

function loadCommentsTable() {
  fetch('/api/admin/comments')
    .then(function(r) { return r.json(); })
    .then(function(comments) {
      var tbody = document.getElementById('comments-tbody');
      tbody.innerHTML = '';
      comments.forEach(function(c) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + c.id + '</td><td>' + escapeHtml(c.author) + '<br><small style="color:#999;">' + escapeHtml(c.email) + '</small></td><td><a href="/post/' + c.post_slug + '" target="_blank">' + escapeHtml(c.post_title) + '</a></td><td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(c.content) + '</td><td>' + c.created_at + '</td>' +
          '<td><button class="btn btn-danger btn-sm" data-delete-comment="' + c.id + '">Delete</button></td>';
        tbody.appendChild(tr);
      });
    });
}

function loadCategoriesTable() {
  fetch('/api/admin/categories')
    .then(function(r) { return r.json(); })
    .then(function(cats) {
      var tbody = document.getElementById('categories-tbody');
      tbody.innerHTML = '';
      cats.forEach(function(c) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + c.id + '</td><td>' + escapeHtml(c.name) + '</td><td>' + escapeHtml(c.slug) + '</td>' +
          '<td><button class="btn btn-secondary btn-sm" data-edit-category="' + c.id + '">Edit</button> <button class="btn btn-danger btn-sm" data-delete-category="' + c.id + '">Delete</button></td>';
        tbody.appendChild(tr);
      });
    });
}

// ========== Settings ==========
function loadSettings() {
  fetch('/api/admin/settings')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      document.getElementById('settings-icp').value = (data.settings && data.settings.icp) ? data.settings.icp : '';
      document.getElementById('settings-gongan').value = (data.settings && data.settings.gongan) ? data.settings.gongan : '';
    })
    .catch(function(e) { console.error('Load settings error:', e); });
}

function loadCspReports() {
  var listEl = document.getElementById('csp-reports-list');
  listEl.innerHTML = '<p style="color:#999;">Loading...</p>';
  fetch('/api/admin/csp-reports')
    .then(function(r) { return r.json(); })
    .then(function(reports) {
      if (!reports || reports.length === 0) {
        listEl.innerHTML = '<p style="color:#2e7d32;font-weight:500;">✓ No CSP violations detected. Your site has not been attacked.</p>';
        return;
      }
      listEl.innerHTML = '';
      reports.forEach(function(r) {
        var div = document.createElement('div');
        div.style.cssText = 'padding:12px 0;border-bottom:1px solid #eee;font-size:13px;';
        div.innerHTML = '<span style="color:#999;">' + new Date(r.created_at).toLocaleString() + '</span>' +
          '<br><strong>Detail:</strong> ' + escapeHtml(r.detail || 'No details');
        listEl.appendChild(div);
      });
    })
    .catch(function() {
      listEl.innerHTML = '<p style="color:#c00;">Failed to load reports.</p>';
    });
}

function saveSettings() {
  var icp = document.getElementById('settings-icp').value.trim();
  var gongan = document.getElementById('settings-gongan').value.trim();
  fetch('/api/admin/settings', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ icp: icp, gongan: gongan })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.success) { showToast('Settings saved!'); } else { showToast(data.error || 'Save failed'); }
  });
}

// ========== Tab Switch ==========
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  document.getElementById('tab-' + tab).classList.add('active');
  // Highlight the clicked tab button
  var btn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
  if (btn) btn.classList.add('active');
  if (tab === 'posts') loadPostsTable();
  if (tab === 'users') loadUsersTable();
  if (tab === 'links') loadLinksTable();
  if (tab === 'comments') loadCommentsTable();
  if (tab === 'categories') loadCategoriesTable();
  if (tab === 'settings') loadSettings();
  if (tab === 'csp') loadCspReports();
  if (tab === 'totp') loadTotpSetup();
}

// ========== Post Modal ==========
function openPostModal(id) {
  editingPostId = id;
  var post = { title: '', slug: '', content: '', category: 'daily', password: '' };

  function showModal(post, categories) {
    if (id) { document.getElementById('modal-title').textContent = 'Edit Post'; }
    else { document.getElementById('modal-title').textContent = 'New Post'; }
    var catOptions = (categories || []).map(function(c) {
      return '<option value="' + escapeHtml(c.name) + '"' + (c.name === post.category ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>';
    }).join('');
    document.getElementById('modal-content').innerHTML =
      '<div class="modal-form">' +
      '<div class="form-group"><label>Title *</label><input type="text" id="mp-title" value="' + escapeHtml(post.title) + '"></div>' +
      '<div class="form-group"><label>Slug *</label><input type="text" id="mp-slug" value="' + escapeHtml(post.slug) + '" placeholder="letters/numbers/hyphens"></div>' +
      '<div class="form-group"><label>Category</label><select id="mp-category" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:4px;font-size:14px;font-family:inherit;">' + catOptions + '</select></div>' +
      '<div class="form-group"><label>Password (leave empty for no protection)</label><input type="text" id="mp-password" value="' + escapeHtml(post.password || '') + '" placeholder="set a password"></div>' +
      '<div class="form-group"><label>Attachments</label>' +
      '<div class="upload-toolbar">' +
      '<button type="button" class="upload-btn" data-upload="image" title="Image (max 4MB)">🖼 Image</button>' +
      '<button type="button" class="upload-btn" data-upload="audio" title="Audio (max 4MB)">🎵 Audio</button>' +
      '<button type="button" class="upload-btn" data-upload="video" title="Video (max 4MB)">🎬 Video</button>' +
      '<button type="button" class="upload-btn" data-upload="file" title="File (max 4MB)">📎 File</button>' +
      '<span style="color:#ccc;margin:0 2px;">|</span>' +
      '<button type="button" class="upload-btn" data-video-link="" title="Embed a video" style="color:#0070f3;">🔗 Video Link</button>' +
      '<button type="button" class="upload-btn" data-file-link="" title="Link to a file on cloud storage" style="color:#0070f3;">📎 File Link</button>' +
      '</div><div id="upload-progress" style="font-size:12px;color:#888;margin-top:4px;display:none;"></div></div>' +
      '<div class="form-group"><label>Content * (Markdown format)</label><textarea id="mp-content">' + escapeHtml(post.content) + '</textarea></div>' +
      '</div>';
    modalAction = 'post';
    openModal();
  }

  fetch('/api/admin/categories').then(function(r) { return r.json(); }).then(function(cats) {
    if (id) {
      fetch('/api/admin/posts').then(function(r2) { return r2.json(); }).then(function(posts) {
        var found = posts.find(function(p) { return p.id === id; });
        showModal(found || post, cats);
      });
    } else {
      showModal(post, cats);
    }
  });
}

// ========== Link Modal ==========
function openLinkModal(id) {
  editingLinkId = id;
  var friend = { name: '', url: '', description: '', sort_order: 0 };

  function showModal(friend) {
    if (id) { document.getElementById('modal-title').textContent = 'Edit Link'; }
    else { document.getElementById('modal-title').textContent = 'Add Link'; }
    document.getElementById('modal-content').innerHTML =
      '<div class="modal-form">' +
      '<div class="form-group"><label>Name *</label><input type="text" id="mf-name" value="' + escapeHtml(friend.name) + '"></div>' +
      '<div class="form-group"><label>URL *</label><input type="text" id="mf-url" value="' + escapeHtml(friend.url) + '" placeholder="https://"></div>' +
      '<div class="form-group"><label>Description</label><input type="text" id="mf-description" value="' + escapeHtml(friend.description || '') + '"></div>' +
      '<div class="form-group"><label>Sort Order</label><input type="number" id="mf-sort" value="' + friend.sort_order + '"></div>' +
      '</div>';
    modalAction = 'link';
    openModal();
  }

  if (id) {
    fetch('/api/admin/friends').then(function(r) { return r.json(); }).then(function(data) {
      var list = data.friends || data;
      var found = list.find(function(f) { return f.id === id; });
      showModal(found || friend);
    });
  } else {
    showModal(friend);
  }
}

// ========== Category Modal ==========
function openCategoryModal() {
  editingCategoryId = null;
  document.getElementById('modal-title').textContent = 'Add Category';
  document.getElementById('modal-content').innerHTML =
    '<div class="modal-form">' +
    '<div class="form-group"><label>Name *</label><input type="text" id="mc-name" placeholder="e.g.: Daily"></div>' +
    '<div class="form-group"><label>Slug * (English identifier)</label><input type="text" id="mc-slug" placeholder="e.g.: daily"></div>' +
    '</div>';
  modalAction = 'category';
  openModal();
}

function editCategoryModal(id) {
  fetch('/api/admin/categories').then(function(r) { return r.json(); }).then(function(cats) {
    var found = cats.find(function(c) { return c.id === id; });
    if (!found) return;
    editingCategoryId = id;
    document.getElementById('modal-title').textContent = 'Edit Category';
    document.getElementById('modal-content').innerHTML =
      '<div class="modal-form">' +
      '<div class="form-group"><label>Name *</label><input type="text" id="mc-name" value="' + escapeHtml(found.name) + '"></div>' +
      '<div class="form-group"><label>Slug * (English identifier)</label><input type="text" id="mc-slug" value="' + escapeHtml(found.slug) + '"></div>' +
      '</div>';
    modalAction = 'category-edit';
    openModal();
  });
}

function confirmCategoryEdit() {
  var data = { name: document.getElementById('mc-name').value.trim(), slug: document.getElementById('mc-slug').value.trim() };
  if (!data.name || !data.slug) { showToast('Please fill in name and slug'); return; }
  fetch('/api/admin/categories/' + editingCategoryId, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  }).then(function(r) { return r.json(); }).then(function(result) {
    if (result.success) { showToast('Updated!'); closeModal(); loadCategoriesTable(); loadDashboardData(); }
    else { showToast(result.error || 'Update failed'); }
  });
}

// ========== Modal Actions ==========
function openModal(title, contentHtml, onConfirm) {
  var overlay = document.getElementById('modal-overlay');
  if (title) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-content').innerHTML = contentHtml || '';
    modalOnConfirm = onConfirm || null;
    overlay.style.display = 'flex';
  } else {
    overlay.style.display = 'flex';
  }
}

var modalOnConfirm = null;

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  modalOnConfirm = null;
}

function modalConfirm() {
  if (modalOnConfirm) { modalOnConfirm(); return; }
  if (modalAction === 'post') confirmPost();
  else if (modalAction === 'link') confirmLink();
  else if (modalAction === 'category') confirmCategory();
  else if (modalAction === 'category-edit') confirmCategoryEdit();
}

function confirmPost() {
  var data = {
    title: document.getElementById('mp-title').value.trim(),
    slug: document.getElementById('mp-slug').value.trim(),
    category: document.getElementById('mp-category').value || 'general',
    password: document.getElementById('mp-password').value,
    content: document.getElementById('mp-content').value
  };
  if (!data.title || !data.slug || !data.content) { showToast('Please fill in required fields'); return; }
  var url = editingPostId ? '/api/admin/posts/' + editingPostId : '/api/admin/posts';
  var method = editingPostId ? 'PUT' : 'POST';
  fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.success || d.id) { showToast('Saved!'); closeModal(); loadPostsTable(); loadDashboardData(); }
      else { showToast(d.error || 'Save failed'); }
    });
}

function confirmLink() {
  var data = {
    name: document.getElementById('mf-name').value.trim(),
    url: document.getElementById('mf-url').value.trim(),
    description: document.getElementById('mf-description').value.trim(),
    sort_order: parseInt(document.getElementById('mf-sort').value) || 0
  };
  if (!data.name || !data.url) { showToast('Please fill in name and URL'); return; }
  var url = editingLinkId ? '/api/admin/friends/' + editingLinkId : '/api/admin/friends';
  var method = editingLinkId ? 'PUT' : 'POST';
  fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    .then(function(r) { return r.json(); }).then(function(result) {
      if (result.success || result.id) { showToast('Saved!'); closeModal(); loadLinksTable(); loadDashboardData(); }
      else { showToast(result.error || 'Save failed'); }
    });
}

function confirmCategory() {
  var data = { name: document.getElementById('mc-name').value.trim(), slug: document.getElementById('mc-slug').value.trim() };
  if (!data.name || !data.slug) { showToast('Please fill in name and slug'); return; }
  fetch('/api/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    .then(function(r) { return r.json(); }).then(function(result) {
      if (result.success || result.id) { showToast('Added!'); closeModal(); loadCategoriesTable(); loadDashboardData(); }
      else { showToast(result.error || 'Add failed'); }
    });
}

// ========== Delete Operations ==========
function deletePost(id) {
  if (!confirm('Delete this post? This cannot be undone.')) return;
  fetch('/api/admin/posts/' + id, { method: 'DELETE' })
    .then(function() { showToast('Deleted'); loadPostsTable(); loadDashboardData(); })
    .catch(function() { showToast('Delete failed'); });
}

function deleteLink(id) {
  if (!confirm('Delete this link?')) return;
  fetch('/api/admin/friends/' + id, { method: 'DELETE' })
    .then(function() { showToast('Deleted'); loadLinksTable(); loadDashboardData(); })
    .catch(function() { showToast('Delete failed'); });
}

function deleteComment(id) {
  if (!confirm('Delete this comment?')) return;
  fetch('/api/admin/comments/' + id, { method: 'DELETE' })
    .then(function() { showToast('Deleted'); loadCommentsTable(); loadDashboardData(); })
    .catch(function() { showToast('Delete failed'); });
}

function deleteCategory(id) {
  if (!confirm('Delete this category?')) return;
  fetch('/api/admin/categories/' + id, { method: 'DELETE' })
    .then(function() { showToast('Deleted'); loadCategoriesTable(); loadDashboardData(); })
    .catch(function() { showToast('Delete failed'); });
}

// ========== Change Password ==========
function changePassword() {
  var oldPwd = document.getElementById('old-password').value;
  var newPwd = document.getElementById('new-password').value;
  var confirmPwd = document.getElementById('confirm-password').value;
  if (!oldPwd || !newPwd || !confirmPwd) { showToast('Please fill in all fields'); return; }
  if (newPwd !== confirmPwd) { showToast('Passwords do not match'); return; }
  if (newPwd.length < 6) { showToast('New password must be at least 6 characters'); return; }
  fetch('/api/admin/password', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.success) { showToast('Password changed!');
      document.getElementById('old-password').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-password').value = ''; }
    else { showToast(data.error || 'Update failed'); }
  });
}

// ========== Recovery Codes ==========
function generateRecoveryCodes() {
  if (!confirm('This will invalidate all existing recovery codes and generate 8 new ones. Continue?')) return;
  fetch('/api/admin/recovery-codes', { method: 'POST' }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.codes) {
      var el = document.getElementById('recovery-codes-list');
      el.innerHTML = data.codes.map(function(c) { return '<div style="padding:4px 0;border-bottom:1px dotted #eee;">' + c + '</div>'; }).join('');
      el.style.color = '#333';
      showToast('8 recovery codes generated! Save them now — they won\'t be shown again.');
    }
  });
}

// ========== TOTP Setup ==========
function loadTotpSetup() {
  var qrEl = document.getElementById('totp-qr');
  var secretEl = document.getElementById('totp-secret');
  if (qrEl) qrEl.innerHTML = '<span style="color:#999;">Loading QR code...</span>';
  fetch('/api/admin/totp-setup')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.qr) {
        qrEl.innerHTML = '<img src="' + data.qr + '" alt="TOTP QR Code" style="width:220px;height:220px;">';
      } else {
        qrEl.innerHTML = '<span style="color:#c00;">Failed to load QR code</span>';
      }
      if (secretEl && data.secret) secretEl.textContent = data.secret;
    })
    .catch(function() {
      if (qrEl) qrEl.innerHTML = '<span style="color:#c00;">Failed to load QR code</span>';
    });
}

// ========== User Management ==========
var usersList = [];

function loadUsersTable() {
  fetch('/api/admin/users')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      usersList = data.users || [];
      var tbody = document.getElementById('users-tbody');
      if (usersList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#999;padding:24px;">暂无用户</td></tr>';
        return;
      }
      tbody.innerHTML = usersList.map(function(u) {
        return '<tr>' +
          '<td>' + u.id + '</td>' +
          '<td>' + escapeHtml(u.name) + '</td>' +
          '<td>' + (u.created_at ? String(u.created_at).slice(0, 10) : '-') + '</td>' +
          '<td>' +
            '<button class="btn btn-sm" data-edit-user="' + u.id + '">改密码</button> ' +
            '<button class="btn btn-sm" data-reset-user="' + u.id + '">重置</button> ' +
            '<button class="btn btn-sm btn-danger" data-delete-user="' + u.id + '">删除</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    })
    .catch(function() { showToast('加载用户失败'); });
}

function findUserName(id) {
  for (var i = 0; i < usersList.length; i++) {
    if (usersList[i].id === id) return usersList[i].name;
  }
  return '';
}

function openAddUser() {
  openModal('新增用户',
    '<div class="modal-form">' +
    '<div class="form-group"><label>姓名 *</label><input type="text" id="mu-name" placeholder="中文姓名"></div>' +
    '<p style="font-size:12px;color:#999;margin:0;">密码将自动生成为姓名拼音</p>' +
    '</div>',
    function() {
      var name = document.getElementById('mu-name').value.trim();
      if (!name) { showToast('请输入姓名'); return; }
      fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name }) })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (d.success) { closeModal(); showToast('已创建，密码：' + d.password); loadUsersTable(); }
          else { showToast(d.error || '创建失败'); }
        })
        .catch(function() { showToast('创建失败'); });
    });
}

function openUserEdit(id) {
  var name = findUserName(id);
  openModal('编辑用户',
    '<div class="modal-form">' +
    '<div class="form-group"><label>姓名</label><input type="text" id="mu-name" value="' + escapeHtml(name) + '"></div>' +
    '<div class="form-group"><label>新密码（留空则不修改）</label><input type="text" id="mu-password" placeholder="留空则不修改"></div>' +
    '</div>',
    function() {
      var newName = document.getElementById('mu-name').value.trim();
      var newPwd = document.getElementById('mu-password').value.trim();
      fetch('/api/admin/users/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName, password: newPwd }) })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (d.success) { closeModal(); showToast('已保存'); loadUsersTable(); }
          else { showToast(d.error || '保存失败'); }
        })
        .catch(function() { showToast('保存失败'); });
    });
}

function resetUserPassword(id) {
  if (!confirm('确定要重置该用户的密码为姓名拼音吗？')) return;
  fetch('/api/admin/users/' + id + '/reset-password', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.success) { showToast('已重置，新密码：' + d.password); loadUsersTable(); }
      else { showToast(d.error || '重置失败'); }
    })
    .catch(function() { showToast('重置失败'); });
}

function deleteUser(id) {
  if (!confirm('确定要删除该用户吗？')) return;
  fetch('/api/admin/users/' + id, { method: 'DELETE' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.success) { showToast('已删除'); loadUsersTable(); }
      else { showToast(d.error || '删除失败'); }
    })
    .catch(function() { showToast('删除失败'); });
}

function toggleBatchImport() {
  var box = document.getElementById('batch-import-box');
  var show = box.style.display === 'none' || box.style.display === '';
  box.style.display = show ? 'block' : 'none';
  if (!show) document.getElementById('batch-result').style.display = 'none';
}

function confirmBatchImport() {
  var names = document.getElementById('batch-names').value;
  if (!names.trim()) { showToast('请输入名单'); return; }
  fetch('/api/admin/users/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names: names }) })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.success) { showToast(d.error || '导入失败'); return; }
      var resultEl = document.getElementById('batch-result');
      var html = '<b>成功创建 ' + d.created.length + ' 个账号：</b>';
      d.created.forEach(function(u) {
        html += '<div style="margin-top:4px;">' + escapeHtml(u.name) + ' — 密码：<b>' + escapeHtml(u.password) + '</b></div>';
      });
      if (d.skipped && d.skipped.length) {
        html += '<div style="color:#999;margin-top:8px;">跳过（已存在）：' + d.skipped.map(escapeHtml).join('、') + '</div>';
      }
      resultEl.innerHTML = html;
      resultEl.style.display = 'block';
      document.getElementById('batch-names').value = '';
      loadUsersTable();
    })
    .catch(function() { showToast('导入失败'); });
}

// ========== Logout ==========
function handleLogout() {
  fetch('/api/admin/logout', { method: 'POST' }).then(function() { window.location.href = '/admin'; });
}

// ========== Utilities ==========
function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ========== File Upload ==========
function triggerUpload(type) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = { image: 'image/*', audio: 'audio/*', video: 'video/*', file: '*/*' }[type];
  input.onchange = function(e) { var file = e.target.files[0]; if (file) doUpload(file, type); };
  input.click();
}

function insertVideoLink() {
  var url = prompt('Enter video URL (YouTube, Bilibili, or any iframe src):');
  if (!url || !url.trim()) return;
  var ta = document.getElementById('mp-content');
  var embed = '';
  var biliMatch = url.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/);
  if (biliMatch) { embed = '<iframe src="https://player.bilibili.com/player.html?bvid=' + biliMatch[1] + '&page=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" style="width:100%;aspect-ratio:16/9;"></iframe>\n'; }
  if (!embed) { var ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/); if (ytMatch) { embed = '<iframe src="https://www.youtube.com/embed/' + ytMatch[1] + '" frameborder="0" allowfullscreen style="width:100%;aspect-ratio:16/9;"></iframe>\n'; } }
  if (!embed) { embed = '<iframe src="' + url.trim() + '" frameborder="0" allowfullscreen style="width:100%;aspect-ratio:16/9;"></iframe>\n'; }
  insertAtCursor(ta, embed);
}

function insertFileLink() {
  var name = prompt('File name (e.g. "Course slides"):');
  if (!name || !name.trim()) return;
  var url = prompt('File share link:');
  if (!url || !url.trim()) return;
  var ta = document.getElementById('mp-content');
  insertAtCursor(ta, '[📎 ' + name.trim() + '](' + url.trim() + ')\n');
}

function insertAtCursor(ta, text) {
  if (ta.setSelectionRange) {
    var start = ta.selectionStart;
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(ta.selectionEnd);
    ta.selectionStart = ta.selectionEnd = start + text.length;
    ta.focus();
  } else {
    ta.value += '\n' + text;
    ta.focus();
  }
}

function doUpload(file, type) {
  var progressEl = document.getElementById('upload-progress');
  var size = (file.size / 1024).toFixed(1);

  // Client-side size check before upload (Vercel limit ~4.5MB, keep safely under)
  var maxSize = 4.3 * 1024 * 1024; // 4.3MB
  if (file.size > maxSize) {
    progressEl.style.display = 'block';
    progressEl.textContent = '✗ File too large (' + (file.size / 1024 / 1024).toFixed(1) + 'MB). Max 4MB.';
    setTimeout(function() { progressEl.style.display = 'none'; }, 4000);
    return;
  }

  progressEl.style.display = 'block';
  progressEl.textContent = 'Uploading ' + file.name + ' (' + size + 'KB)...';
  var formData = new FormData();
  formData.append('file', file);
  fetch('/api/admin/upload', { method: 'POST', body: formData })
    .then(function(res) {
      if (!res.ok) {
        // Check if response is JSON before parsing (Vercel may return HTML error pages)
        var contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          return res.json().then(function(d) { throw new Error(d.error || 'Upload failed'); });
        }
        // Non-JSON response (e.g. Vercel "Request Entity Too Large" HTML page)
        throw new Error('Server error (file may be too large). Max 4MB.');
      }
      return res.json();
    })
    .then(function(data) {
      var ta = document.getElementById('mp-content');
      var mt = data.mimetype || '';
      var embed = '';
      if (mt.startsWith('image/')) { embed = '![](' + data.url + ')\n'; }
      else if (mt.startsWith('audio/')) { embed = '<audio controls src="' + data.url + '"></audio>\n'; }
      else if (mt.startsWith('video/')) { embed = '<video controls src="' + data.url + '"></video>\n'; }
      else { embed = '[📎 ' + (data.filename || file.name) + '](' + data.url + ')\n'; }
      insertAtCursor(ta, embed);
      progressEl.textContent = '✓ Uploaded: ' + (data.filename || file.name);
      setTimeout(function() { progressEl.style.display = 'none'; }, 3000);
    })
    .catch(function(err) {
      console.error('Upload error:', err);
      progressEl.textContent = '✗ ' + (err.message || 'Upload failed');
      setTimeout(function() { progressEl.style.display = 'none'; }, 4000);
    });
}

function showToast(msg) {
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 3000);
}

// ESC to close modal
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeModal();
});

// Expose to window for inline onclick in static HTML (tab buttons, etc.)
window.switchTab = switchTab;
window.openPostModal = openPostModal;
window.openLinkModal = openLinkModal;
window.openCategoryModal = openCategoryModal;
window.deletePost = deletePost;
window.deleteLink = deleteLink;
window.deleteComment = deleteComment;
window.deleteCategory = deleteCategory;
window.saveSettings = saveSettings;
window.changePassword = changePassword;
window.handleLogout = handleLogout;
window.modalConfirm = modalConfirm;
window.closeModal = closeModal;
window.triggerUpload = triggerUpload;
window.insertVideoLink = insertVideoLink;
window.insertFileLink = insertFileLink;
})();
