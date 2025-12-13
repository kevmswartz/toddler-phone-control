Project folders to avoid editing the wrong files
- Main Roku web app (what loads on devices/browsers): edit `index.html`, `app.js`, `styles/tailwind.css`, plus assets under `public/`. Run `npm run build` to regenerate `dist/` for the packaged app.
- Netlify-hosted config site (https://toddler-roku.netlify.app): edit files in `netlify/public/` (e.g., `netlify/public/index.html`, `netlify/public/editor.html`). Netlify serves this folder per `netlify.toml`.
- Netlify Functions for cloud config/blobs: edit code in `netlify/functions/` (config, auth helper, etc.).
- Build/script helpers: `scripts/` (e.g., `scripts/build.js` copies `public/` into `dist/`).
