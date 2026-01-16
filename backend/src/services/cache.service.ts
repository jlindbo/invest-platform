import redisClient from '../config/redis';
import logger from '../utils/logger';

/**
 * Cache Service
 * Centralized Redis caching with TTL management, JSON serialization, and pattern-based deletion
 */
class CacheService {
  /**
   * Get a cached value by key
   * @param key Cache key
   * @returns Parsed value or null if not found or expired
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redisClient.get(key);
      if (!value) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set a value in cache with TTL
   * @param key Cache key
   * @param value Value to cache (will be JSON stringified)
   * @param ttlSeconds Time to live in seconds
   */
  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await redisClient.setEx(key, ttlSeconds, serialized);
      logger.debug(`Cache set: ${key} (TTL: ${ttlSeconds}s)`);
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete a specific cache key
   * @param key Cache key to delete
   */
  async delete(key: string): Promise<void> {
    try {
      await redisClient.del(key);
      logger.debug(`Cache deleted: ${key}`);
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Clear cache keys matching a pattern
   * @param pattern Glob-style pattern (e.g., "live:*")
   */
  async clear(pattern: string): Promise<void> {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
        logger.info(`Cache cleared: ${keys.length} keys matching pattern "${pattern}"`);
      } else {
        logger.debug(`Cache clear: no keys matching pattern "${pattern}"`);
      }
    } catch (error) {
      logger.error(`Cache clear error for pattern ${pattern}:`, error);
      throw error;
    }
  }

  /**
   * Check if a key exists in cache
   * @param key Cache key
   * @returns true if key exists, false otherwise
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Cache exists check error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   * @param key Cache key
   * @returns TTL in seconds, or -1 if key has no expiry, or -2 if key doesn't exist
   */
  async ttl(key: string): Promise<number> {
    try {
      return await redisClient.ttl(key);
    } catch (error) {
      logger.error(`Cache TTL check error for key ${key}:`, error);
      return -2;
    }
  }
}

export default new CacheService();
