(function() {
  var currentBgUrl = '';
  var preloadedUrl = '';
  var preloadedImg = null;
  var bgList = [];
  var listLoaded = false;

  function loadImageList() {
    if (listLoaded && bgList.length > 0) return Promise.resolve(bgList);
    return fetch('/api/random-bg/list')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        bgList = data.urls || [];
        listLoaded = true;
        return bgList;
      })
      .catch(function() {
        bgList = [
          'https://picsum.photos/id/1015/1920/1080',
          'https://picsum.photos/id/1016/1920/1080',
          'https://picsum.photos/id/1018/1920/1080',
          'https://picsum.photos/id/1020/1920/1080',
          'https://picsum.photos/id/1025/1920/1080',
          'https://picsum.photos/id/1035/1920/1080',
          'https://picsum.photos/id/1039/1920/1080',
          'https://picsum.photos/id/1043/1920/1080',
          'https://picsum.photos/id/1049/1920/1080',
          'https://picsum.photos/id/1051/1920/1080',
          'https://picsum.photos/id/1069/1920/1080',
          'https://picsum.photos/id/1076/1920/1080',
          'https://picsum.photos/id/1084/1920/1080',
          'https://picsum.photos/id/1094/1920/1080',
          'https://picsum.photos/id/1103/1920/1080',
          'https://picsum.photos/id/1115/1920/1080',
          'https://picsum.photos/id/1128/1920/1080',
          'https://picsum.photos/id/1138/1920/1080',
          'https://picsum.photos/id/1147/1920/1080',
          'https://picsum.photos/id/1159/1920/1080'
        ];
        listLoaded = true;
        return bgList;
      });
  }

  function randomUrl() {
    return bgList[Math.floor(Math.random() * bgList.length)];
  }

  function setBg(url) {
    document.body.style.backgroundImage = 'url(' + url + ')';
    currentBgUrl = url;
  }

  function preloadNext() {
    loadImageList().then(function() {
      var url = randomUrl();
      preloadedImg = new Image();
      preloadedImg.onload = function() { preloadedUrl = url; };
      preloadedImg.src = url;
    });
  }

  var titleEl = document.querySelector('#header h1');
  if (titleEl) {
    titleEl.addEventListener('click', function() {
      if (preloadedUrl) {
        setBg(preloadedUrl);
        preloadedUrl = '';
        preloadedImg = null;
        preloadNext();
      } else {
        loadImageList().then(function() {
          setBg(randomUrl());
          preloadNext();
        });
      }
    });
  }

  loadImageList().then(function() {
    setBg(randomUrl());
    preloadNext();
  });

  // ====== Fold / Unfold ======
  var foldState = null;
  var body = document.body;
  var leftBtn = document.getElementById('fold-btn-left');
  var rightBtn = document.getElementById('fold-btn-right');
  var container = document.getElementById('container');

  function toggleFold(side) {
    if (foldState === side) {
      body.classList.remove('folded-left', 'folded-right');
      foldState = null;
    } else {
      body.classList.remove('folded-left', 'folded-right');
      body.classList.add('folded-' + side);
      foldState = side;
    }
  }

  if (leftBtn) {
    leftBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleFold('left');
    });
  }

  if (rightBtn) {
    rightBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleFold('right');
    });
  }

  // Click folded bar (or label) to unfold
  if (container) {
    container.addEventListener('click', function() {
      if (foldState) {
        body.classList.remove('folded-left', 'folded-right');
        foldState = null;
      }
    });
  }
})();
