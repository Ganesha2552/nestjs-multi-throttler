import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerStorageRecord } from './throttler-storage-record.interface';
import { ThrottlerStorage } from './throttler-storage.interface';
import { THROTTLER_OPTIONS } from './throttler.constants';
import { ThrottlerException } from './throttler.exception';
import { ThrottlerGuard } from './throttler.guard';
import { ThrottlerStorageRedisService } from './throttler.service';

class ThrottlerStorageServiceMock implements ThrottlerStorage {
  private _storage: Record<string, ThrottlerStorageRecord> = {};
  get storage(): Record<string, ThrottlerStorageRecord> {
    return this._storage;
  }

  private getExpirationTime(key: string): number {
    return Math.floor((this.storage[key].timeToExpire - Date.now()) / 1000);
  }

  async increment(key: string, ttl: number): Promise<ThrottlerStorageRecord> {
    const ttlMilliseconds = ttl * 1000;
    if (!this.storage[key]) {
      this.storage[key] = { totalHits: 0, timeToExpire: Date.now() + ttlMilliseconds };
    }

    let timeToExpire = this.getExpirationTime(key);

    // Reset the `expiresAt` once it has been expired.
    if (timeToExpire <= 0) {
      this.storage[key].timeToExpire = Date.now() + ttlMilliseconds;
      timeToExpire = this.getExpirationTime(key);
    }

    this.storage[key].totalHits++;

    return {
      totalHits: this.storage[key].totalHits,
      timeToExpire,
    };
  }
}

function contextMockFactory(
  type: 'http' | 'ws' | 'graphql',
  handler: () => any,
  mockFunc: Record<string, any>,
): ExecutionContext {
  const executionPartial: Partial<ExecutionContext> = {
    getClass: () => ThrottlerStorageServiceMock as any,
    getHandler: () => handler,
    switchToRpc: () => ({
      getContext: () => ({} as any),
      getData: () => ({} as any),
    }),
    getArgs: () => [] as any,
    getArgByIndex: () => ({} as any),
    getType: () => type as any,
  };
  switch (type) {
    case 'ws':
      executionPartial.switchToHttp = () => ({} as any);
      executionPartial.switchToWs = () => mockFunc as any;
      break;
    case 'http':
      executionPartial.switchToWs = () => ({} as any);
      executionPartial.switchToHttp = () => mockFunc as any;
      break;
    case 'graphql':
      executionPartial.switchToWs = () => ({} as any);
      executionPartial.switchToHttp = () =>
        ({
          getNext: () => ({} as any),
        } as any);
      executionPartial.getArgByIndex = () => mockFunc as any;
      break;
  }
  return executionPartial as ExecutionContext;
}

describe('ThrottlerGuard', () => {
  let guard: ThrottlerGuard;
  let reflector: Reflector;
  let service: ThrottlerStorageServiceMock;
  let handler: () => any;

  beforeEach(async () => {
    const modRef = await Test.createTestingModule({
      providers: [
        ThrottlerGuard,
        {
          provide: THROTTLER_OPTIONS,
          useValue: {
            limits: [
              { timeUnit: 'hour', limit: 15 },
              { timeUnit: 'minute', limit: 10 },
            ],
            ignoreUserAgents: [/userAgentIgnore/],
            storage: new ThrottlerStorageRedisService(),
            skipIf: () => false,
          },
        },
        {
          provide: ThrottlerStorage,
          useClass: ThrottlerStorageServiceMock,
        },
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();
    guard = modRef.get(ThrottlerGuard);
    reflector = modRef.get(Reflector);
    service = modRef.get<ThrottlerStorageServiceMock>(ThrottlerStorage);
  });
  

  it('should have all of the providers defined', () => {
    expect(guard).toBeDefined();
    expect(reflector).toBeDefined();
    expect(service).toBeDefined();
  });

  describe('HTTP Context', () => {
    let reqMock;
    let resMock;
    let headerSettingMock: jest.Mock;

    beforeEach(() => {
      headerSettingMock = jest.fn();
      resMock = {
        header: headerSettingMock,
      };
      reqMock = {
        headers: {},
      };
    });

    afterEach(() => {
      headerSettingMock.mockClear();
    });

    it('should add headers to the res', async () => {
      handler = function addHeaders() {
        return 'string';
      };

      const ctxMock = contextMockFactory('http', handler, {
        getResponse: () => resMock,
        getRequest: () => reqMock,
      });

      const canActivate = await guard.canActivate(ctxMock);

      expect(canActivate).toBe(true);
      expect(headerSettingMock).toBeCalledTimes(6);
      expect(headerSettingMock).toHaveBeenNthCalledWith(1, 'X-RateLimit-Limit-hour', 15);
      expect(headerSettingMock).toHaveBeenNthCalledWith(2, 'X-RateLimit-Remaining-hour', 14);
      expect(headerSettingMock).toHaveBeenNthCalledWith(4, 'X-RateLimit-Limit-minute', 10);
      expect(headerSettingMock).toHaveBeenNthCalledWith(5, 'X-RateLimit-Remaining-minute', 9);
      expect(headerSettingMock).toHaveBeenNthCalledWith(
        6,
        'X-RateLimit-Reset-minute',
        expect.any(Number),
      );
    });

    it('should return an error after passing the limit', async () => {
      handler = function returnError() {
        return 'string';
      };

      const ctxMock = contextMockFactory('http', handler, {
        getResponse: () => resMock,
        getRequest: () => reqMock,
      });

      for (let i = 0; i < 10; i++) {
        await guard.canActivate(ctxMock);
      }

      await expect(guard.canActivate(ctxMock)).rejects.toThrowError(ThrottlerException);
      expect(headerSettingMock).toBeCalledTimes(64);
      expect(headerSettingMock).toHaveBeenLastCalledWith('Retry-After', expect.any(Number));
    });

    it('should pull values from the reflector instead of options', async () => {
      handler = function useReflector() {
        return 'string';
      };

      reflector.getAllAndOverride = jest
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce([
          { timeUnit: 'hour', limit: 12 },
          { timeUnit: 'minute', limit: 7 },
        ]);

      const ctxMock = contextMockFactory('http', handler, {
        getResponse: () => resMock,
        getRequest: () => reqMock,
      });

      const canActivate = await guard.canActivate(ctxMock);

      expect(canActivate).toBe(true);
      expect(headerSettingMock).toBeCalledTimes(6);
      expect(headerSettingMock).toHaveBeenNthCalledWith(1, 'X-RateLimit-Limit-hour', 12);
      expect(headerSettingMock).toHaveBeenNthCalledWith(2, 'X-RateLimit-Remaining-hour', 11);
      expect(headerSettingMock).toHaveBeenNthCalledWith(4, 'X-RateLimit-Limit-minute', 7);
      expect(headerSettingMock).toHaveBeenNthCalledWith(5, 'X-RateLimit-Remaining-minute', 6);
      expect(headerSettingMock).toHaveBeenNthCalledWith(
        6,
        'X-RateLimit-Reset-minute',
        expect.any(Number),
      );
    });

    it('should skip due to the user-agent header', async () => {
      handler = function userAgentSkip() {
        return 'string';
      };

      reqMock['headers'] = {
        'user-agent': 'userAgentIgnore',
      };

      const ctxMock = contextMockFactory('http', handler, {
        getResponse: () => resMock,
        getRequest: () => reqMock,
      });

      const canActivate = await guard.canActivate(ctxMock);

      expect(canActivate).toBe(true);
      expect(headerSettingMock).toBeCalledTimes(0);
    });
  });
});
