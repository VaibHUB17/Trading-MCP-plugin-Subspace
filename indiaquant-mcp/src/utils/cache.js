/**
 * In-memory TTL (Time-To-Live) cache implementation
 * Stores data with automatic expiration
 */

class Cache {
  constructor() {
    this.store = new Map();
  }

  /**
   * Set a cache entry with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds
   */
  set(key, value, ttl) {
    const expiresAt = Date.now() + (ttl * 1000);
    this.store.set(key, { value, expiresAt });
  }

  /**
   * Get a cache entry
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if expired/not found
   */
  get(key) {
    const entry = this.store.get(key);
    
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    
    return entry.value;
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete a cache entry
   * @param {string} key - Cache key
   */
  delete(key) {
    this.store.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.store.clear();
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    let validEntries = 0;
    let expiredEntries = 0;
    const now = Date.now();

    for (const entry of this.store.values()) {
      if (now > entry.expiresAt) {
        expiredEntries++;
      } else {
        validEntries++;
      }
    }

    return {
      total: this.store.size,
      valid: validEntries,
      expired: expiredEntries
    };
  }
}

// Create singleton cache instance
const cache = new Cache();

// Clean up expired entries every 5 minutes
setInterval(() => {
  cache.cleanup();
}, 5 * 60 * 1000);

export default cache;
