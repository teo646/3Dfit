// One page, one bundle: loads model_in_clothes.snap3d, live and rotating, under the
// title and tagline in index.html. The viewer itself comes from snap3d-viewer's own
// published build (see index.html's <script src>) - this repo carries no copy of it,
// so a viewer fix there shows up here without anything to keep in sync by hand.

(() => {
  const BUNDLE = './bundle/model_in_clothes.snap3d';

  // Transparent (the 4th, alpha component of the viewer's [r, g, b, a] `background`) -
  // #stage has no background of its own (see index.html's CSS), so .page's white shows
  // straight through the canvas's empty pixels, right out to the edges the canvas now
  // spans, and the bundle reads as floating on that white rather than boxed onto a card.
  const STAGE_BACKGROUND = [1, 1, 1, 0];

  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const progress = $('progress');
  const status = $('status');
  const canvas = $('canvas');

  const fail = (error) => {
    progress.hidden = false;
    progress.classList.add('failed');
    status.textContent = String(error?.message ?? error);
    console.error(error);
  };

  /**
   * Centre and fill the stage with whatever the bundle drew.
   *
   * The pose in config.json is the one the pipeline picked for a 1280x800 window, and
   * this stage is neither that size nor that shape, so it tends to leave the surface
   * small and hugging one edge. Rather than hard-code an offset, read back the frame,
   * take the bounding box of everything that is not background, and pan and zoom until
   * it sits in the middle at a comfortable size. Two passes: the first is approximate
   * because zooming changes what is visible, the second settles it.
   */
  function fitToView(v, fill = 0.86) {
    const gl = v.gl;
    const { width, height } = v.canvas;
    if (!width || !height) return;
    const pixels = new Uint8Array(width * height * 4);

    for (let pass = 0; pass < 2; pass++) {
      v.renderFrame();
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      // The background is pure white (255,255,255); anything meaningfully darker or
      // more saturated than that is surface.
      let minX = width, maxX = -1, minY = height, maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          if (Math.max(r, g, b) - Math.min(r, g, b) > 12 || Math.min(r, g, b) < 210) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return; // nothing drawn - leave the shipped pose alone

      // readPixels is bottom-up, which is also the sign convention of `up` below.
      const offsetX = (minX + maxX) / 2 / width - 0.5;
      const offsetY = (minY + maxY) / 2 / height - 0.5;
      const halfHeight = v.camera.radius * Math.tan((v.config.initial_camera.fov_deg * Math.PI) / 360);
      const halfWidth = halfHeight * (width / height);

      const [right, up] = v.camera.forwardAxes;
      const target = v.camera.origin.map(
        (c, i) => c + 2 * offsetX * halfWidth * right[i] + 2 * offsetY * halfHeight * up[i],
      );
      const occupancy = Math.max((maxX - minX) / width, (maxY - minY) / height);
      v.setCamera({ target, radius: v.camera.radius * (occupancy / fill) });
    }
  }

  function settle() {
    fitToView(viewer);
    viewer.setHome(); // R returns to this framing, not the pose the fit moved away from
    progress.hidden = true;
    stage.classList.add('live');
  }

  function onReadyFailed() {} // onError already reported it; this only stops the rejection

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
  viewer.ready.then(settle, onReadyFailed);
})();
