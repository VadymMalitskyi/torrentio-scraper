export class MemoryCache {
  #entries = new Map();
  #maxWeight;
  #weight = 0;
  #weigh;

  constructor({ maxWeight = 1000, weigh = () => 1 } = {}) {
    this.#maxWeight = maxWeight;
    this.#weigh = weigh;
  }

  get(key) {
    const entry = this.#entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.delete(key);
      return undefined;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs) {
    this.delete(key);
    const weight = Math.max(1, this.#weigh(value));
    if (weight > this.#maxWeight) {
      return value;
    }
    this.#entries.set(key, {
      value,
      weight,
      expiresAt: Date.now() + ttlMs,
    });
    this.#weight += weight;
    this.#evict();
    return value;
  }

  delete(key) {
    const entry = this.#entries.get(key);
    if (entry) {
      this.#weight -= entry.weight;
      this.#entries.delete(key);
    }
  }

  clear() {
    this.#entries.clear();
    this.#weight = 0;
  }

  #evict() {
    while (this.#weight > this.#maxWeight) {
      const oldestKey = this.#entries.keys().next().value;
      this.delete(oldestKey);
    }
  }
}
