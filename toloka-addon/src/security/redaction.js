const SECRET_KEY = /(authorization|cookie|password|passkey|secret|token|announce|download.?url)/i;
const URL_SECRET = /([?&](?:passkey|auth|token|key)=)[^&#\s]+/gi;

export function redactValue(value, key = '') {
  if (SECRET_KEY.test(key)) {
    return '[REDACTED]';
  }
  if (typeof value === 'string') {
    return value
      .replace(URL_SECRET, '$1[REDACTED]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactValue(childValue, childKey),
      ]),
    );
  }
  return value;
}
