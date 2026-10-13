KOOM Install Page
=================

Included files:
- index.html
- style.css
- app.js

Deployment:
1. Upload these files to your site's /install/ directory.
2. Open https://koom.site/install/
3. Check that the existing PWA manifest is reachable at https://koom.site/manifest.json.
   If your manifest has a different path, update the <link rel="manifest"> line in index.html.
4. Keep your existing service worker and PWA setup; this page does not replace them.

Important:
- Native installation prompt appears only when the browser decides the existing PWA meets its installability requirements.
- On browsers without a prompt, the page gives manual installation instructions.
- The preview artwork is CSS-made and does not require image assets.
- The "Open web player" links go to https://koom.site/ via relative root links.
