# snap3d clothes

One page, one live bundle (`bundle/model_in_clothes.snap3d`), rendered with
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
