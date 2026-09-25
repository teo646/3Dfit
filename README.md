# snap3d clothes

One page: a sample store's product page with a Before/After switch. "Before" is the
usual photo gallery (`assets/product/`, five shots from the same capture) beside a buy
box (name, color, price, size, cart, buy); "after" swaps the gallery photo for the live
3D view in the same spot and at the same size, so the buy box never moves. The render
sits above the buy box in stacking order, so a drag that carries the figure past the
gallery's edge covers it the way one real object in front of another would - and a tap
on an empty patch of canvas still reaches the button or size swatch underneath it. The
live bundle (`bundle/model_in_clothes.snap3d`) is rendered with
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
