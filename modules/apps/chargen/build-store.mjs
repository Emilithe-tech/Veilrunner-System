/**
 * The character creator's single mutable draft.  UI code may only update it
 * through set/replace so every view observes the same draft object.
 */
export class ChargenBuildStore {
  constructor(initial, { setProperty = null, deepClone = value => structuredClone(value) } = {}) {
    this.state = deepClone(initial);
    this.#setProperty = setProperty;
    this.#deepClone = deepClone;
    this.#listeners = new Set();
  }

  #listeners;
  #setProperty;
  #deepClone;

  subscribe(listener) { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  snapshot() { return this.#deepClone(this.state); }

  set(path, value) {
    if (!path || /(?:^|\.)(?:__proto__|constructor|prototype)(?:\.|$)/i.test(path)) return false;
    if (this.#setProperty) this.#setProperty(this.state, path, value);
    else path.split(".").reduce((target, key, index, keys) => index === keys.length - 1 ? (target[key] = value) : (target[key] ??= {}), this.state);
    this.#notify(path);
    return true;
  }

  replace(next, reason = "replace") { this.state = this.#deepClone(next); this.#notify(reason); }
  #notify(reason) { for (const listener of this.#listeners) listener(this.state, reason); }
}
