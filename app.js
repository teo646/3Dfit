// One page, one bundle: a sample store's product page, shown two ways. "Before" is the
// page every store already has - a photo gallery beside the buy box. "After" swaps the
// gallery for model_in_clothes.snap3d, live and rotating, in the exact same spot and at
// the same size as the photo it replaced - so the buy box stays top right, unmoved,
// exactly where "before" already had it. Rotating past that framing isn't expected, but
// nothing stops a user from dragging an arm or shoulder past its edge, and when that
// happens the render simply wins: its drawn pixels sit above the buy box, the way one
// real object in front of another would, and a tap that lands on empty canvas still
// reaches whatever control is under it (see canvas's pointerdown below). The viewer
// itself comes from snap3d-viewer's own published build (see index.html's <script
// src>) - this repo carries no copy of it, so a viewer fix there shows up here without
// anything to keep in sync by hand.

(() => {
  const BUNDLE = './bundle/model_in_clothes.snap3d';

  // Transparent (the 4th, alpha component of the viewer's [r, g, b, a] `background`) -
  // #viewer-layer carries the page's white behind the canvas, so the bundle reads as
  // floating on the page rather than boxed onto a card, and so alpha reliably marks
  // "nothing drawn here" for both fitToView and the click passthrough below.
  const STAGE_BACKGROUND = [1, 1, 1, 0];

  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const progress = $('progress');
  const status = $('status');
  const canvas = $('canvas');
  const mainShot = $('main-shot');
  const wipeLine = $('wipe-line');
  const switcher = document.querySelector('.switch');
  const tabs = [...switcher.querySelectorAll('[role="tab"]')];
  const afterTab = $('tab-after');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  let view = 'before';
  let ready = false;
  let interacted = false;

  const fail = (error) => {
    progress.hidden = false;
    progress.classList.add('failed');
    status.textContent = String(error?.message ?? error);
    afterTab.removeAttribute('data-loading');
    console.error(error);
  };

  /**
   * The box, in the canvas's CSS pixels, that the render should fill: wherever the main
   * product photo sits. Switching to "after" then swaps the photo for the 3D view in the
   * same place and at the same size, so the buy box beside it never has to move.
   */
  function targetBox() {
    const c = canvas.getBoundingClientRect();
    const m = mainShot.getBoundingClientRect();
    return { x: m.left - c.left, y: m.top - c.top, w: m.width, h: m.height };
  }

  /**
   * Pan and zoom until whatever the bundle drew sits centred in `box` at `fill` of its
   * size.
   *
   * The pose in config.json is the one the pipeline picked for a 1280x800 window, and
   * this stage is neither that size nor that shape, so rather than hard-code an offset,
   * read back the frame, take the bounding box of everything that is not background,
   * and move the camera. Zooming scales about the canvas centre, not the box's, so each
   * pass leaves the next a smaller correction; three settle it.
   */
  function fitToView(v, box, fill = 0.88) {
    const gl = v.gl;
    const { width, height } = v.canvas;
    if (!width || !height || !box.w || !box.h) return;
    const s = width / v.canvas.clientWidth; // CSS px to device px
    const boxCx = (box.x + box.w / 2) * s;
    const boxCy = height - (box.y + box.h / 2) * s; // readPixels is bottom-up
    const boxW = box.w * s;
    const boxH = box.h * s;
    const pixels = new Uint8Array(width * height * 4);

    for (let pass = 0; pass < 3; pass++) {
      v.renderFrame();
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      // Empty pixels are transparent (see STAGE_BACKGROUND); drawn ones are opaque.
      let minX = width, maxX = -1, minY = height, maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (pixels[(y * width + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return; // nothing drawn - leave the shipped pose alone

      const offsetX = ((minX + maxX) / 2 - boxCx) / width;
      const offsetY = ((minY + maxY) / 2 - boxCy) / height;
      const halfHeight = v.camera.radius * Math.tan((v.config.initial_camera.fov_deg * Math.PI) / 360);
      const halfWidth = halfHeight * (width / height);

      const [right, up] = v.camera.forwardAxes;
      const target = v.camera.origin.map(
        (c, i) => c + 2 * offsetX * halfWidth * right[i] + 2 * offsetY * halfHeight * up[i],
      );
      const occupancy = Math.max((maxX - minX) / boxW, (maxY - minY) / boxH);
      v.setCamera({ target, radius: v.camera.radius * (occupancy / fill) });
    }
  }

  /** Fit from the home azimuth, so a refit mid-rotation doesn't size to a side-on pose. */
  function refit() {
    if (!ready) return;
    const { azimuth, elevation } = viewer.camera;
    const home = viewer.home;
    viewer.setCamera({ azimuth: home.azimuth, elevation: home.elevation });
    fitToView(viewer, targetBox());
    viewer.setHome();
    viewer.setCamera({ azimuth, elevation });
  }

  function settle() {
    ready = true;
    fitToView(viewer, targetBox());
    viewer.setHome(); // R returns to this framing, not the pose the fit moved away from
    progress.hidden = true;
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
      // Open on the same front view the first photo shows, then let the rotation reveal
      // the side and back the photos can only hint at.
      if (ready && !interacted) viewer.resetCamera();
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

  /** True when the render actually drew something (alpha > 0) at this viewport point. */
  function opaqueAt(clientX, clientY) {
    if (!ready) return false;
    const rect = canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) return false;
    const s = canvas.width / rect.width;
    const x = Math.round((clientX - rect.left) * s);
    const y = Math.round((rect.bottom - clientY) * s); // readPixels is bottom-up
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false;
    // The drawing buffer isn't preserved between frames, so whatever the last rAF drew
    // may already be gone by the time a click's readPixels runs; redraw the current pose
    // first so this always reads the frame the visitor is actually looking at.
    viewer.renderFrame();
    const pixel = new Uint8Array(4);
    viewer.gl.readPixels(x, y, 1, 1, viewer.gl.RGBA, viewer.gl.UNSIGNED_BYTE, pixel);
    return pixel[3] > 8;
  }

  // The canvas sits above the buy box (see index.html) so the render can win when it
  // rotates across it, but that would swallow every click over the buy box's own
  // footprint too, drawn there or not. A tap that lands on empty canvas is forwarded to
  // whatever sits underneath instead of starting a drag; only a tap that actually lands
  // on drawn geometry behaves like the viewer's own controls expect.
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (opaqueAt(e.clientX, e.clientY)) {
        interacted = true;
        return;
      }
      e.stopImmediatePropagation();
      canvas.style.pointerEvents = 'none';
      const under = document.elementFromPoint(e.clientX, e.clientY);
      canvas.style.pointerEvents = '';
      under?.closest('label, button')?.click();
    },
    { capture: true },
  );

  // ---------- the store's own gallery and buttons ----------

  const shots = ['정면', '사선', '측면', '뒷면', '디테일'];
  const thumbs = [...document.querySelectorAll('.thumbs button')];
  for (const thumb of thumbs) {
    thumb.addEventListener('click', () => {
      const n = Number(thumb.dataset.shot);
      for (const t of thumbs) t.setAttribute('aria-current', String(t === thumb));
      $('main-img').src = `./assets/product/shot-${n}.jpg`;
      $('main-img').alt = `맨투맨을 입은 모델의 ${shots[n - 1]} 사진`;
      $('shot-index').textContent = n;
    });
  }

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

  // ---------- viewer ----------

  const viewer = new Snap3dViewer(canvas, BUNDLE, {
    background: STAGE_BACKGROUND,
    onProgress: (loaded, total) => {
      $('bar').firstElementChild.style.width = `${(loaded / total) * 100}%`;
      status.textContent =
        loaded < total
          ? `${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`
          : 'decompressing…';
    },
    onError: fail,
  });
  window.viewer = viewer; // a console handle
  afterTab.setAttribute('data-loading', '');
  viewer.ready.then(settle, onReadyFailed);

  // The photo box moves with the layout; keep the render sitting in it.
  let refitTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(refitTimer);
    refitTimer = setTimeout(() => {
      viewer.resize();
      refit();
      if (view === 'before') viewer.stop();
    }, 180);
  }).observe(stage);
})();
