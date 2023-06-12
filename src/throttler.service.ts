import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { FindOneAndUpdateOptions, MongoClient } from 'mongodb';
import { ThrottlerStorageRecord } from './throttler-storage-record.interface';
import { ThrottlerModuleOptions } from './throttler-module-options.interface';
import { ThrottlerStorage } from './throttler-storage.interface';

@Injectable()
export class ThrottlerStorageService implements ThrottlerStorage, OnApplicationShutdown {
  private redisClient: Redis;
  private mongoClient: MongoClient;
  private _storage: Record<string, ThrottlerStorageRecord>;
  get storage(): Record<string, ThrottlerStorageRecord> {
    return this._storage;
  }
  constructor(private throttleOptions: ThrottlerModuleOptions) {
    // Initialize Redis or MongoDB clients if the respective storage type is selected
    if (throttleOptions.storage.type === 'redis') {
      this.redisClient = new Redis(throttleOptions.storage.redisOptions.url);
    } else if (throttleOptions.storage.type === 'mongodb') {
      this.mongoClient = new MongoClient(throttleOptions.storage.mongoOptions.url);
      this.mongoClient.connect().then(() => {
        this.createTTLIndex();
      });
    } else {
      // Initialize in-memory storage
      this._storage = {};
    }
  }

  /**
   * Creates a TTL index on the `expireAt` field in the MongoDB collection.
   */
  private async createTTLIndex(): Promise<void> {
    await this.mongoClient
      .db()
      .collection('throttler')
      .createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
  }

  /**
   * Increments the request count for the specified key
   * and updates the TTL (time to live) for the key's expiration.
   * @param key The key for which to increment the request count.
   * @param ttlMilliseconds The TTL value in milliseconds for the key's expiration.
   * @returns The updated request count and time to expiration.
   */
  async increment(key: string, ttlMilliseconds: number): Promise<ThrottlerStorageRecord> {
    // Update the Redis or MongoDB record if the respective storage type is selected
    if (this.throttleOptions.storage.type === 'redis') {
      const totalHits = await this.redisClient.incr(key);
      await this.redisClient.expire(key, ttlMilliseconds / 1000);
      return {
        totalHits,
        timeToExpire: ttlMilliseconds / 1000,
      };
    } else if (this.throttleOptions.storage.type === 'mongodb') {
      const result = await this.mongoClient
        .db()
        .collection('throttler')
        .findOneAndUpdate(
          { key },
          {
            $inc: { totalHits: 1 },
            $setOnInsert: { expireAt: new Date(Date.now() + ttlMilliseconds) },
          },
          {
            upsert: true,
            returnDocument: 'after',
          } as FindOneAndUpdateOptions,
        );
      const { totalHits, expireAt } = result.value;
      return {
        totalHits,
        timeToExpire: Math.floor(expireAt.getTime() - Date.now() / 1000),
      };
    }

    // If the storage type is not Redis or MongoDB, fallback to in-memory storage
    if (!this._storage[key]) {
      this._storage[key] = { totalHits: 0, timeToExpire: Date.now() + ttlMilliseconds };
    }

    let timeToExpire = this.getExpirationTime(key);

    // Reset the timeToExpire once it has expired.
    if (timeToExpire <= 0) {
      this._storage[key].timeToExpire = Date.now() + ttlMilliseconds;
      timeToExpire = this.getExpirationTime(key);
    }

    this._storage[key].totalHits++;

    return {
      totalHits: this._storage[key].totalHits,
      timeToExpire: this.getExpirationTime(key),
    };
  }

  /**
   * Calculates the remaining time to expiration for a given key in seconds.
   * @param key The key for which to calculate the remaining time to expiration.
   * @returns The remaining time to expiration in seconds.
   */
  private getExpirationTime(key: string): number {
    return Math.floor((this.storage[key].timeToExpire - Date.now()) / 1000);
  }

  /**
   * Cleans up the resources when the application shuts down.
   */
  onApplicationShutdown() {
    if (this.redisClient) {
      this.redisClient.quit();
    }
    if (this.mongoClient) {
      this.mongoClient.close();
    }
  }
}
