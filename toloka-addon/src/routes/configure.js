import { manifest } from '../manifest.js';

export function configureHandler(req, res) {
  const manifestUrl = `${req.addonBaseUrl}/manifest.json`;
  const installUrl = manifestUrl.replace(/^https?:\/\//, 'stremio://');
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(manifest.name)}</title>
  <style>
    body { max-width: 42rem; margin: 4rem auto; padding: 0 1.5rem; font: 16px system-ui; line-height: 1.5; }
    code { overflow-wrap: anywhere; }
    a.button { display: inline-block; padding: .75rem 1rem; color: white; background: #6039a8; border-radius: .4rem; text-decoration: none; }
  </style>
</head>
<body>
  <h1>${escapeHtml(manifest.name)}</h1>
  <p>${escapeHtml(manifest.description)}</p>
  <p><a class="button" href="${escapeHtml(installUrl)}">Install in Stremio</a></p>
  <p>Manifest: <code>${escapeHtml(manifestUrl)}</code></p>
</body>
</html>`);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character]);
}
