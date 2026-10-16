// Offline support for the mirrored site: service worker, save-progress pill, tap-to-enlarge.
(function () {
  var root = document.currentScript.getAttribute('data-root') || './';

  // ---- service worker + progress pill
  var pill = document.createElement('div');
  pill.className = 'ofl-pill';
  function show(text, hideAfter) {
    pill.textContent = text;
    if (!pill.parentNode) document.body.appendChild(pill);
    pill.classList.add('on');
    clearTimeout(pill._t);
    if (hideAfter) pill._t = setTimeout(function () { pill.classList.remove('on'); }, hideAfter);
  }
  var announced = false;
  try { announced = localStorage.getItem('ofl-ready') === '1'; } catch (e) {}
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.type === 'progress') show('Saving for offline ' + Math.floor(100 * d.done / d.total) + '%');
      if (d.type === 'ready') {
        if (!announced) show('Saved. Works offline now', 4000); else pill.classList.remove('on');
        announced = true;
        try { localStorage.setItem('ofl-ready', '1'); } catch (e) {}
      }
      if (d.type === 'error') show('Couldn’t finish saving. Open again with internet to resume', 6000);
    });
    navigator.serviceWorker.register(root + 'sw.js', { scope: root }).then(function () {
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      if (navigator.onLine && reg.active) reg.active.postMessage({ type: 'cache-media' });
    }).catch(function () {});
  }

  // ---- lightbox
  function isPageLink(a) {
    if (!a) return false;
    var h = a.getAttribute('href') || '';
    if (!h || h === '#' || /\.(jpe?g|png|gif|webp)(\?|$)/i.test(h) || /lightbox/i.test(a.className)) return false;
    if (a.href.split('#')[0].split('?')[0] === location.href.split('#')[0].split('?')[0]) return false;
    return true;
  }
  function candidates() {
    return Array.prototype.filter.call(document.querySelectorAll('main img, #page img, article img, .gallery img, .sqs-block-image img'), function (img) {
      if (img.closest('header, footer, .header, #footer-sections, .instagram-block, .sqs-block-instagram')) return false;
      if (isPageLink(img.closest('a'))) return false;
      var r = img.getBoundingClientRect();
      return img.naturalWidth > 150 && r.width > 40;
    }).filter(function (img, i, arr) { return arr.indexOf(img) === i; });
  }
  var box, big, list = [], idx = 0;
  function build() {
    box = document.createElement('div');
    box.className = 'ofl-lb';
    box.innerHTML = '<img alt=""><button class="ofl-x" aria-label="Close">×</button><button class="ofl-prev" aria-label="Previous">‹</button><button class="ofl-next" aria-label="Next">›</button>';
    big = box.querySelector('img');
    document.body.appendChild(box);
    box.addEventListener('click', function (e) {
      if (e.target.classList.contains('ofl-prev')) return go(-1);
      if (e.target.classList.contains('ofl-next')) return go(1);
      close();
    });
    var sx = null;
    box.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (sx === null) return;
      var dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 50) { e.preventDefault(); go(dx < 0 ? 1 : -1); }
    });
    document.addEventListener('keydown', function (e) {
      if (!box.classList.contains('on')) return;
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1);
    });
  }
  function open(img) {
    if (!box) build();
    list = candidates(); idx = Math.max(0, list.indexOf(img));
    box.classList.toggle('single', list.length < 2);
    big.src = img.currentSrc || img.src;
    box.classList.add('on'); document.documentElement.style.overflow = 'hidden';
  }
  function go(n) { if (!list.length) return; idx = (idx + n + list.length) % list.length; big.src = list[idx].currentSrc || list[idx].src; }
  function close() { box.classList.remove('on'); document.documentElement.style.overflow = ''; }
  document.addEventListener('click', function (e) {
    var img = e.target.closest && e.target.closest('img');
    if (!img) {
      // clicks often land on overlay layers above the image
      var wrap = e.target.closest && e.target.closest('.gallery-grid-item, .gallery-masonry-item, .gallery-strips-item, .gallery-slideshow-item, .sqs-block-image figure, .slide');
      if (wrap && !isPageLink(e.target.closest('a'))) img = wrap.querySelector('img');
    }
    if (!img || candidates().indexOf(img) < 0) return;
    e.preventDefault(); e.stopPropagation();
    open(img);
  }, true);
})();
