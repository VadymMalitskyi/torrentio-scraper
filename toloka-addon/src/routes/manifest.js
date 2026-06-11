import { manifest } from '../manifest.js';

export function manifestHandler(_req, res) {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(manifest);
}
