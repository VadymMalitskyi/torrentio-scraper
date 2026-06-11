import { redactValue } from '../security/redaction.js';

const levels = new Map([
  ['debug', 10],
  ['info', 20],
  ['warn', 30],
  ['error', 40],
]);

export function createLogger({ level = 'info' } = {}) {
  const threshold = levels.get(level) ?? levels.get('info');

  return Object.fromEntries(
    [...levels].map(([name, weight]) => [
      name,
      (message, fields = {}) => {
        if (weight < threshold) {
          return;
        }
        const record = {
          timestamp: new Date().toISOString(),
          level: name,
          message,
          ...redactValue(fields),
        };
        const output = JSON.stringify(record);
        (weight >= levels.get('error') ? console.error : console.log)(output);
      },
    ]),
  );
}
