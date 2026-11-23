document.addEventListener('DOMContentLoaded', function() {
  var form = document.getElementById('login-form');
  var nameEl = document.getElementById('login-name');
  var pwdEl = document.getElementById('login-password');
  var errEl = document.getElementById('login-error');
  var btn = document.getElementById('login-btn');

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    var name = nameEl.value.trim();
    var password = pwdEl.value;
    if (!name || !password) { errEl.textContent = '请输入姓名和密码'; return; }
    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = '登录中…';
    try {
      var res = await fetch('/api/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, password: password })
      });
      var data = await res.json();
      if (res.ok && data.success) {
        var redirect = new URLSearchParams(window.location.search).get('redirect');
        window.location.href = redirect || '/posts';
      } else {
        errEl.textContent = data.error || '登录失败，请重试';
      }
    } catch (err) {
      errEl.textContent = '网络错误，请重试';
    } finally {
      btn.disabled = false;
      btn.textContent = '登录';
    }
  });
});
