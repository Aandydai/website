document.addEventListener('DOMContentLoaded', function() {
  var loginBtn = document.getElementById('login-btn');
  var usernameEl = document.getElementById('username');
  var passwordEl = document.getElementById('password');
  var errorEl = document.getElementById('login-error');

  // Load Turnstile widget
  var script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);

  function handleLogin() {
    var username = usernameEl.value.trim();
    var password = passwordEl.value;

    if (!username || !password) {
      errorEl.textContent = 'Please enter username and password';
      errorEl.style.display = 'block';
      return;
    }

    var turnstileToken = document.querySelector('[name="cf-turnstile-response"]');
    if (!turnstileToken || !turnstileToken.value) {
      errorEl.textContent = 'Please complete the captcha';
      errorEl.style.display = 'block';
      return;
    }

    var totpCode = document.getElementById('totp-input').value.trim();
    if (!totpCode || totpCode.length !== 6) {
      errorEl.textContent = 'Please enter the 6-digit verification code';
      errorEl.style.display = 'block';
      return;
    }

    loginBtn.textContent = 'Logging in...';
    loginBtn.disabled = true;

    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username,
        password: password,
        'cf-turnstile-response': turnstileToken.value,
        totp: totpCode
      })
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.success) {
        window.location.href = '/admin/dashboard';
      } else {
        // Reset Turnstile on failure
        if (window.turnstile) window.turnstile.reset();
        errorEl.textContent = data.error || 'Wrong username or password';
        errorEl.style.display = 'block';
        loginBtn.textContent = 'Login';
        loginBtn.disabled = false;
      }
    }).catch(function() {
      if (window.turnstile) window.turnstile.reset();
      errorEl.textContent = 'Login failed, please try again';
      errorEl.style.display = 'block';
      loginBtn.textContent = 'Login';
      loginBtn.disabled = false;
    });
  }

  // Disable button until Turnstile is ready
  loginBtn.disabled = true;
  loginBtn.textContent = 'Loading...';

  // Wait for Turnstile to load, then render widget
  var checkInterval = setInterval(function() {
    if (window.turnstile) {
      clearInterval(checkInterval);
      window.turnstile.render('#turnstile-widget', {
        sitekey: '0x4AAAAAADlqE0ldkFp00wjv',
        theme: 'auto',
        callback: function() {
          loginBtn.disabled = false;
          loginBtn.textContent = 'Login';
          errorEl.style.display = 'none';
        },
        'error-callback': function() {
          errorEl.textContent = 'Captcha failed to load, please refresh the page';
          errorEl.style.display = 'block';
        }
      });
    }
  }, 200);

  loginBtn.addEventListener('click', handleLogin);
  passwordEl.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') handleLogin();
  });
});
