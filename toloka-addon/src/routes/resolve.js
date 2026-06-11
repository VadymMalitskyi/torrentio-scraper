import { verifyPayload } from '../security/payload.js';

export function createResolveHandler({ config, playback, logger }) {
  return async (req, res) => {
    let selection;
    try {
      selection = verifyPayload(
        req.params.payload,
        req.params.signature,
        config.signingSecret,
        { ttlSeconds: config.resolverTtlSeconds },
      );
    } catch {
      return res.status(404).end();
    }

    try {
      const result = await playback.resolve(selection, req.ip);
      return res.redirect(302, result.url);
    } catch (error) {
      logger.error('Playback resolution failed', {
        topicId: selection.topicId,
        infoHash: selection.infoHash,
        errorName: error.name,
        errorCode: error.code,
      });
      return res.redirect(302, '/static/failed.mp4');
    }
  };
}
