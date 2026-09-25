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
   * Where `config.frame` places the render: `fill`, how much of `box`'s tighter
   * dimension the object should occupy (`max(objW/boxW, objH/boxH)` - can be above 1,
   * an intentional close crop, and is reproduced exactly, never clamped), and
   * `anchor`, the `[x, y]` fraction of `box` (0..1, y from the top) the rotation axis
   * itself should land on. A bundle with no `frame` block falls back to `{fill: 0.88,
   * anchor: [0.5, 0.5]}` - centred, filling most of the box - which is what this page
   * always did before `frame` existed.
   *
   * Both are defined against the axis (`viewer.rotation.center`), not the object's own
   * silhouette, on purpose: the object's *pose* changes what its bounding box looks
   * like from frame to frame (an arm swung out, a different rotation reveals a wider
   * silhouette), but the axis is the one point that does not, so anchoring on it is
   * what keeps the framing stable as the object turns - see the axis-projection
   * helper in snap3d-viewer's own editor (`_updateAxisLine`), which this mirrors.
   *
   * The pose in config.json is tuned against whatever window the operator was
   * actually looking at (the editor's canvas, or the pipeline's 1280x800 render), and
   * this stage's box is rarely that size or shape, so rather than hard-code an
   * offset, read the frame back, locate the axis and the object's bounding box in it,
   * and move the camera until both match `frame` in *this* box. Zooming scales about
   * the canvas centre, not the box's, so each pass leaves the next a smaller
   * correction; eight settle it.
   */
  function applyFrame(v, box) {
    const gl = v.gl;
    const { width, height } = v.canvas;
    if (!width || !height || !box.w || !box.h) return;
    const frame = v.config.frame ?? { fill: 0.88, anchor: [0.5, 0.5] };
    const s = width / v.canvas.clientWidth; // CSS px to device px
    const boxW = box.w * s;
    const boxH = box.h * s;
    // Device px, top-down (matches the projection helper below), not readPixels'
    // bottom-up convention - kept separate from that so neither has to be converted
    // through the other.
    const anchorPxX = (box.x + frame.anchor[0] * box.w) * s;
    const anchorPxY = (box.y + frame.anchor[1] * box.h) * s;
    const pixels = new Uint8Array(width * height * 4);
    const mat4 = Snap3dViewer.mat4;

    // Judge occupancy from the operator's own authored radius every time, not
    // whatever an earlier pass already left the camera at - reading the live radius
    // instead would only ratchet the zoom in one direction on repeated calls (a
    // resize back to a roomier box could never zoom back in to a tighter framing that
    // box would actually fit).
    v.setCamera({ radius: v.config.initial_camera.radius });

    // Eight, not three: radius now also converges iteratively, damped (see below) to
    // stay stable against a large simultaneous pan - a pass budget sized for pan
    // alone, undamped, wasn't enough passes for both to settle.
    for (let pass = 0; pass < 8; pass++) {
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
      // Touching the canvas's own edge (not the box's) means the render is clipped
      // there, not actually that small - the true bounding box continues past what
      // got read back, so the read occupancy is only a lower bound on the real one.
      // A fill above what the canvas has room for hits this on every pass, and
      // trusting a clipped read as exact would ask for a tighter zoom every time,
      // forever. It's still a safe *lower* bound, though: zooming out from it can
      // only shrink the render and move it further from every edge, never worse -
      // only zooming in on an unreliable number is what needs guarding against.
      const clipped = minX <= 0 || maxX >= width - 1 || minY <= 0 || maxY >= height - 1;

      // The axis's own screen position - see the module comment for why this, and
      // not the bounding box just read above, is what gets moved to `anchor`.
      const proj = mat4.multiply(
        mat4.perspective(v.config.initial_camera.fov_deg, width / height, v.camera.radius * 0.02, v.camera.radius * 20),
        v.camera.viewMatrix(),
      );
      const [ax, ay, az] = v.rotation.center;
      const cx = proj[0] * ax + proj[4] * ay + proj[8] * az + proj[12];
      const cy = proj[1] * ax + proj[5] * ay + proj[9] * az + proj[13];
      const cw = proj[3] * ax + proj[7] * ay + proj[11] * az + proj[15];
      if (cw <= 1e-6) return; // the axis is behind the camera - leave the pose alone
      const axisPxX = ((cx / cw) * 0.5 + 0.5) * width;
      const axisPxY = (1 - ((cy / cw) * 0.5 + 0.5)) * height; // top-down

      const offsetX = (axisPxX - anchorPxX) / width;
      const offsetY = (axisPxY - anchorPxY) / height;
      const halfHeight = v.camera.radius * Math.tan((v.config.initial_camera.fov_deg * Math.PI) / 360);
      const halfWidth = halfHeight * (width / height);

      const [right, up] = v.camera.forwardAxes;
      const target = v.camera.origin.map(
        (c, i) => c + 2 * offsetX * halfWidth * right[i] - 2 * offsetY * halfHeight * up[i],
      );
      // occupancy/fill isn't exact in one shot the way the pan correction is: screen
      // size scales as 1/radius only for a point, and the object has real depth
      // relative to how close the camera already is, so nearer and farther parts of
      // it grow at different rates as radius changes - more so here than the old
      // single-shot version ever saw, since a large simultaneous pan (the axis can
      // start well off `anchor`) changes which parts of that depth are even in frame.
      // Applying the full correction each pass overshoots and settles into a
      // two-value oscillation instead of converging; the square root - a half-step in
      // log space - damps that the way any correction to a coupled, nonlinear system
      // needs to be damped, at the cost of needing more passes to close in.
      const occupancy = Math.max((maxX - minX) / boxW, (maxY - minY) / boxH);
      // A clipped-but-already-over-fill reading still means "zoom out, for sure" -
      // only a clipped reading at or under fill is the ambiguous case (the true
      // occupancy could already be there, or well past it) worth leaving alone
      // rather than guessing a tighter zoom off an unreliable number.
      const radius = clipped && occupancy <= frame.fill ? v.camera.radius : v.camera.radius * Math.sqrt(occupancy / frame.fill);
      v.setCamera({ target, radius });
    }
  }

  /** Fit from the home azimuth, so a refit mid-rotation doesn't size to a side-on pose. */
  function refit() {
    if (!ready) return;
    const { azimuth, elevation } = viewer.camera;
    const home = viewer.home;
    viewer.setCamera({ azimuth: home.azimuth, elevation: home.elevation });
    applyFrame(viewer, targetBox());
    viewer.setHome();
    viewer.setCamera({ azimuth, elevation });
  }

  function settle() {
    ready = true;
    applyFrame(viewer, targetBox());
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
