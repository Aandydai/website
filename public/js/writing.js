/* Writing 批改页逻辑 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var state = { type: 'application', busy: false };

  var DIM_LABELS = { content: '内容', language: '语言', structure: '结构' };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function apiJson(url, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var e = new Error(data.error || ('请求失败(' + r.status + ')'));
          e.status = r.status;
          throw e;
        }
        return data;
      });
    });
  }

  function setHint(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'w-hint' + (kind ? ' ' + kind : '');
  }

  function showMsg(text, kind) {
    var el = $('gradeMsg');
    el.hidden = false;
    el.className = 'w-msg' + (kind ? ' ' + kind : '');
    el.textContent = text;
  }

  function hideMsg() { $('gradeMsg').hidden = true; }

  /* 图片在浏览器端缩小为 JPEG，避免超 4.3MB 且减少识别耗时 */
  function downscaleImage(file, maxDim, quality) {
    return new Promise(function (resolve) {
      if (typeof createImageBitmap !== 'function' || !/^image\//.test(file.type)) { resolve(file); return; }
      createImageBitmap(file).then(function (bmp) {
        var w = bmp.width, h = bmp.height;
        var scale = Math.min(1, maxDim / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        canvas.getContext('2d').drawImage(bmp, 0, 0, cw, ch);
        if (bmp.close) bmp.close();
        canvas.toBlob(function (blob) {
          resolve(blob ? new File([blob], 'upload.jpg', { type: 'image/jpeg' }) : file);
        }, 'image/jpeg', quality || 0.82);
      }).catch(function () { resolve(file); });
    });
  }

  function wireUpload(inputId, targetId, hintId) {
    var input = $(inputId);
    if (!input) return;
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      var hint = $(hintId), target = $(targetId);
      setHint(hint, '识别中…', 'loading');
      downscaleImage(file, 1600, 0.82).then(function (f) {
        var fd = new FormData();
        fd.append('file', f, f.name || 'upload');
        return apiJson('/api/writing/extract', { method: 'POST', body: fd });
      }).then(function (data) {
        if (!data.text) throw new Error('未识别到文字');
        target.value = data.text;
        target.dispatchEvent(new Event('input'));
        setHint(hint, '识别完成（' + data.text.length + ' 字）', 'ok');
      }).catch(function (err) {
        setHint(hint, err.message || '识别失败', 'err');
      });
    });
  }

  function switchType(type) {
    state.type = type;
    var tabs = document.querySelectorAll('.w-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].getAttribute('data-type') === type);
    }
    var isCont = type === 'continuation';
    $('continuationCard').hidden = !isCont;
    $('essayLabel').textContent = isCont ? '③ 我的续写' : '② 我的作文';
    $('studentEssay').placeholder = isCont
      ? '粘贴或输入你的续写（约 150 词）；手写拍照可点下方按钮上传识别。'
      : '粘贴或输入你的作文（约 80 词）；手写拍照可点下方按钮上传识别。';
  }

  function updateCount() {
    var v = $('studentEssay').value.trim();
    var words = v ? v.split(/\s+/).length : 0;
    $('essayCount').textContent = words + ' 词';
  }

  /* ---------- 批改 ---------- */
  function doGrade() {
    if (state.busy) return;
    var payload = {
      type: state.type,
      question: $('question').value.trim(),
      sourceText: $('sourceText').value.trim(),
      promptOpeners: $('promptOpeners').value.trim(),
      studentEssay: $('studentEssay').value.trim()
    };
    if (payload.studentEssay.length < 10) { showMsg('请先填写学生作文（至少 10 个字符）。', 'err'); return; }
    if (state.type === 'continuation' && !payload.sourceText) {
      showMsg('提示：读后续写建议填写阅读原文，否则「内容衔接」无法准确评分。', 'warn');
    }

    state.busy = true;
    var btn = $('gradeBtn');
    btn.disabled = true;
    btn.textContent = '批改中…';
    showMsg(state.type === 'continuation' ? 'AI 正在批改读后续写，约 10~25 秒，请稍候…' : 'AI 正在批改应用文，约 5~15 秒，请稍候…', 'loading');

    apiJson('/api/writing/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (data) {
      hideMsg();
      renderResult(data.feedback, payload.studentEssay);
      loadHistory();
    }).catch(function (err) {
      if (err.status === 401) showMsg('登录已过期，请重新登录后再批改。', 'err');
      else showMsg(err.message || '批改失败，请重试。', 'err');
    }).then(function () {
      state.busy = false;
      btn.disabled = false;
      btn.textContent = '开始批改';
    });
  }

  /* ---------- 逐句高亮 ---------- */
  function typeClass(t) {
    if (t === '语法') return 'grammar';
    if (t === '用词') return 'word';
    if (t === '拼写') return 'spell';
    if (t === '连贯') return 'cohere';
    return 'grammar';
  }

  function buildMatches(text, corrections) {
    var ranges = [];
    (corrections || []).forEach(function (c, i) {
      var orig = c && c.original ? String(c.original) : '';
      if (!orig) return;
      var idx = text.indexOf(orig);
      if (idx < 0) return;
      var start = idx, end = idx + orig.length;
      var overlap = ranges.some(function (r) { return start < r.end && end > r.start; });
      if (overlap) return;
      ranges.push({ start: start, end: end, ci: i });
    });
    ranges.sort(function (a, b) { return a.start - b.start; });
    return ranges;
  }

  function highlightEssay(text, corrections) {
    var ranges = buildMatches(text, corrections);
    var out = '', pos = 0;
    ranges.forEach(function (r) {
      out += escapeHtml(text.slice(pos, r.start));
      var c = corrections[r.ci] || {};
      out += '<mark class="mk mk-' + typeClass(c.type) + '" data-ci="' + r.ci + '">'
        + escapeHtml(text.slice(r.start, r.end)) + '</mark>';
      pos = r.end;
    });
    out += escapeHtml(text.slice(pos));
    return out.replace(/\n/g, '<br>');
  }

  function renderCorrections(corrections, text) {
    if (!Array.isArray(corrections) || !corrections.length) return '<p class="w-empty">未发现明显错误 👍</p>';
    var located = buildMatches(text, corrections).map(function (r) { return r.ci; });
    return corrections.map(function (c, i) {
      var isLocated = located.indexOf(i) >= 0;
      return '<div class="w-corr" data-ci="' + i + '">'
        + '<span class="w-tag ' + typeClass(c.type) + '">' + escapeHtml(c.type || '修改') + '</span>'
        + '<div class="w-corr-body">'
        + '<div class="w-corr-diff"><span class="w-orig">' + escapeHtml(c.original || '') + '</span>'
        + '<span class="w-arrow">→</span><span class="w-new">' + escapeHtml(c.corrected || '') + '</span></div>'
        + (c.reason ? '<div class="w-corr-reason">' + escapeHtml(c.reason) + '</div>' : '')
        + (isLocated ? '' : '<div class="w-corr-note">（原文中未能定位，仅供参考）</div>')
        + '</div></div>';
    }).join('');
  }

  function bindMarks() {
    var marks = document.querySelectorAll('#result .mk');
    for (var i = 0; i < marks.length; i++) {
      marks[i].addEventListener('click', function () {
        var ci = this.getAttribute('data-ci');
        var item = document.querySelector('#result .w-corr[data-ci="' + ci + '"]');
        if (!item) return;
        var all = document.querySelectorAll('#result .w-corr');
        for (var j = 0; j < all.length; j++) all[j].classList.remove('flash');
        item.classList.add('flash');
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    var items = document.querySelectorAll('#result .w-corr');
    for (var k = 0; k < items.length; k++) {
      items[k].addEventListener('click', function () {
        var ci = this.getAttribute('data-ci');
        var mk = document.querySelector('#result .mk[data-ci="' + ci + '"]');
        if (!mk) return;
        mk.classList.add('flash');
        mk.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(function () { mk.classList.remove('flash'); }, 1300);
      });
    }
  }

  /* ---------- 渲染结果 ---------- */
  function renderResult(fb, essayText) {
    var box = $('result');
    if (!fb || typeof fb !== 'object') { box.hidden = true; box.innerHTML = ''; return; }

    var dims = fb.dimensions || {};
    var dimCards = Object.keys(dims).map(function (k) {
      var d = dims[k] || {};
      return '<div class="w-dim">'
        + '<div class="w-dim-name">' + escapeHtml(DIM_LABELS[k] || k) + '</div>'
        + '<div class="w-dim-score">' + escapeHtml(d.score != null ? d.score : '—') + '</div>'
        + '<div class="w-dim-comment">' + escapeHtml(d.comment || '') + '</div>'
        + '</div>';
    }).join('');

    var html = ''
      + '<div class="w-score-head">'
      + '<div class="w-total"><span class="w-total-num">' + escapeHtml(fb.total != null ? fb.total : '—') + '</span>'
      + '<span class="w-total-full">分</span></div>'
      + '<div class="w-band">' + escapeHtml(fb.band || '') + '</div>'
      + '</div>'
      + '<div class="w-dims">' + dimCards + '</div>'
      + '<div class="w-block"><div class="w-block-title">✍️ 逐句批改</div>'
      + '<div class="w-essay-view">' + highlightEssay(essayText, fb.corrections) + '</div>'
      + '<div class="w-corr-list">' + renderCorrections(fb.corrections, essayText) + '</div>'
      + '</div>';

    if (Array.isArray(fb.highlights) && fb.highlights.length) {
      html += '<div class="w-block"><div class="w-block-title">🌟 亮点句</div><ul class="w-list">'
        + fb.highlights.map(function (s) { return '<li>' + escapeHtml(s) + '</li>'; }).join('')
        + '</ul></div>';
    }
    if (fb.overall) {
      html += '<div class="w-block"><div class="w-block-title">📋 总评</div><p class="w-overall">' + escapeHtml(fb.overall) + '</p></div>';
    }
    if (fb.polish) {
      html += '<div class="w-block"><div class="w-block-title">💡 范文 / 润色版</div><div class="w-polish">' + escapeHtml(fb.polish) + '</div></div>';
    }

    box.innerHTML = html;
    box.hidden = false;
    bindMarks();
  }

  /* ---------- 历史记录 ---------- */
  function loadHistory() {
    var box = $('historyList');
    apiJson('/api/essays?limit=20').then(function (data) {
      var list = data.essays || [];
      if (!list.length) { box.innerHTML = '<p class="w-empty">暂无记录</p>'; return; }
      box.innerHTML = list.map(function (e) {
        var label = e.essay_type === 'continuation' ? '读后续写' : '应用文';
        return '<button type="button" class="w-hist" data-id="' + e.id + '">'
          + '<span class="w-hist-type">' + label + '</span>'
          + '<span class="w-hist-score">' + (e.score != null ? e.score : '—') + ' 分</span>'
          + '<span class="w-hist-excerpt">' + escapeHtml(e.excerpt || '') + '</span>'
          + '<span class="w-hist-date">' + fmtDate(e.created_at) + '</span>'
          + '</button>';
      }).join('');
      var btns = box.querySelectorAll('.w-hist');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function () { openEssay(this.getAttribute('data-id')); });
      }
    }).catch(function () {
      box.innerHTML = '<p class="w-empty">记录加载失败</p>';
    });
  }

  function openEssay(id) {
    apiJson('/api/essays/' + id).then(function (row) {
      switchType(row.essay_type === 'continuation' ? 'continuation' : 'application');
      $('question').value = row.question || '';
      $('sourceText').value = row.source_text || '';
      $('promptOpeners').value = row.prompt_openers || '';
      $('studentEssay').value = row.student_essay || '';
      updateCount();
      renderResult(row.feedback, row.student_essay || '');
      $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(function (err) { showMsg(err.message || '加载失败', 'err'); });
  }

  function fmtDate(s) {
    if (!s) return '';
    var d = new Date(s);
    if (isNaN(d.getTime())) return '';
    function p(n) { return String(n).padStart(2, '0'); }
    return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------- init ---------- */
  function init() {
    var tabs = document.querySelectorAll('.w-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        if (state.busy) return;
        switchType(this.getAttribute('data-type'));
      });
    }

    wireUpload('questionFile', 'question', 'questionHint');
    wireUpload('sourceFile', 'sourceText', 'sourceHint');
    wireUpload('essayFile', 'studentEssay', 'essayHint');

    $('studentEssay').addEventListener('input', updateCount);
    $('gradeBtn').addEventListener('click', doGrade);
    $('clearBtn').addEventListener('click', function () {
      if (state.busy) return;
      ['question', 'sourceText', 'promptOpeners', 'studentEssay'].forEach(function (id) { $(id).value = ''; });
      updateCount();
      ['questionHint', 'sourceHint', 'essayHint'].forEach(function (id) { setHint($(id), ''); });
      $('result').hidden = true;
      $('result').innerHTML = '';
      hideMsg();
    });

    updateCount();
    loadHistory();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
