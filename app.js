// One page, one bundle: a sample store's product page, shown two ways. "Before" is the
// page every store already has - a photo gallery beside the buy box. "After" swaps the
// gallery photo for model_in_clothes.snap3d, live and rotating, in the exact same spot -
// both are children of #main-shot, which clips to it, so the buy box beside it never
// has to move and the render can never reach past its edge. The viewer itself comes
// from snap3d-viewer's own published build (see index.html's <script src>) - this repo
// carries no copy of it, so a viewer fix there shows up here without anything to keep
// in sync by hand. Sizing, framing and resize handling are entirely the viewer's job;
// this page only sets the canvas's CSS box and swaps tabs.

(() => {
  const BUNDLE = './bundle/model_in_clothes.snap3d';

  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const canvas = $('canvas');
  const wipeLine = $('wipe-line');
  const switcher = document.querySelector('.switch');
  const tabs = [...switcher.querySelectorAll('[role="tab"]')];
  const afterTab = $('tab-after');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  let view = 'before';
  let ready = false;

  // The progress bar/MB counter and the error message both come from the viewer's
  // own built-in loadingIndicator now (see the constructor below) rather than being
  // hand-rolled here - onError only needs to log and stop the "loading" spinner state
  // the After tab shows.
  const fail = (error) => {
    afterTab.removeAttribute('data-loading');
    console.error(error);
  };

  function settle() {
    ready = true;
    stage.classList.add('live');
    afterTab.removeAttribute('data-loading');
    if (view === 'before') viewer.stop(); // nothing on screen to draw for
  }

  function onReadyFailed() {} // onError already reported it; this only stops the rejection

  // ---------- before / after ----------

  function show(next, { focus = false } = {}) {
    if (next === view) return;
    view = next;
    stage.dataset.view = next;
    switcher.dataset.view = next;
    for (const tab of tabs) {
      const on = tab.dataset.view === next;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
    }

    if (!reduceMotion.matches) {
      wipeLine.classList.remove('run-in', 'run-out');
      void wipeLine.offsetWidth; // restart the animation
      wipeLine.classList.add(next === 'after' ? 'run-in' : 'run-out');
    }

    if (next === 'after') {
      viewer.start();
      if (!ready) afterTab.setAttribute('data-loading', '');
    } else if (ready) {
      // Let the wipe finish uncovering the gallery before the render goes still.
      setTimeout(() => view === 'before' && viewer.stop(), reduceMotion.matches ? 0 : 900);
    }
  }

  for (const tab of tabs) tab.addEventListener('click', () => show(tab.dataset.view));
  switcher.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === 'ArrowLeft' || e.key === 'Home' ? 'before' : 'after';
    show(next, { focus: true });
    tabs.find((t) => t.dataset.view === next).focus();
  });

  // ---------- the store's own buttons ----------

  const toast = $('toast');
  let toastTimer = 0;
  const say = (text) => {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  };
  document.querySelector('.btn-cart').addEventListener('click', () => say('예시 화면이라 장바구니에 담기지 않아요'));
  document.querySelector('.btn-buy').addEventListener('click', () => say('예시 화면이라 실제 주문은 진행되지 않아요'));

  const [searchBtn, menuBtn, headerCartBtn] = document.querySelectorAll('.shop-nav button');
  searchBtn.addEventListener('click', () => say('예시 화면이라 검색은 동작하지 않아요'));
  menuBtn.addEventListener('click', () => say('예시 화면이라 메뉴는 동작하지 않아요'));
  headerCartBtn.addEventListener('click', () => say('예시 화면이라 장바구니에 담기지 않아요'));

  // ---------- viewer ----------

  const viewer = new Snap3dViewer(canvas, BUNDLE, {
    loadingIndicator: { color: '#ff5252' }, // snap3d's own accent; the bar/MB-counter/
                                             // error text themselves are the viewer's
    onError: fail,
  });
  window.viewer = viewer; // a console handle
  afterTab.setAttribute('data-loading', '');
  viewer.ready.then(settle, onReadyFailed);
})();
