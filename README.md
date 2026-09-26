# 3Dfit

One page: a sample store's product page with a Before/After switch. "Before" is the
usual photo gallery (`assets/product/`, five shots from the same capture) beside a buy
box (name, color, price, size, cart, buy); "after" swaps the gallery photo for the live
3D view in the same spot, sized and centred a bit larger than the photo it replaces (see
`--viewer-scale` in `index.html`) so it visibly sits on top rather than boxed onto a
card - clipped so it never rises above the shop header. The live bundle
(`bundle/model_in_clothes.snap3d`) is rendered with
[snap3d-viewer](https://github.com/teo646/snap3d-viewer), loaded straight from its
published build:

```html
<script src="https://teo646.github.io/snap3d-viewer/dist/viewer.js"></script>
```

No build step here - `index.html` and `app.js` are served as they are. Open
`index.html` through any static server (`python -m http.server`, for example);
`file://` won't do, since the bundle and the viewer script are both fetched.

To swap in a different capture, replace `bundle/model_in_clothes.snap3d/` with another
`.snap3d` folder from the pipeline's export stage and update the `BUNDLE` path in
`app.js`.

## Deploying

`.github/workflows/pages.yml` publishes this repo as-is to GitHub Pages on every push
to `master` - no build step, so the whole working tree is the artifact. Enabling Pages
is a one-time manual step: **Settings → Pages → Source: GitHub Actions**.
