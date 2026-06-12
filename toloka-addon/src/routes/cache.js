export function createCacheClearHandler({ caches, logger }) {
  return (_req, res) => {
    caches.metadata.clear();
    caches.search.clear();
    caches.torrent.clear();

    logger.info('In-memory caches cleared');
    return res.json({
      ok: true,
      cleared: ['metadata', 'search', 'torrent'],
    });
  };
}
