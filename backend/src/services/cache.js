import Redis from 'ioredis';
import config from '../config/index.js';
import logger from './logger.js';

let redis = null;
let isConnected = false;

function getRedis() {
  if (!redis) {
    redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      enableOfflineQueue: config.redis.enableOfflineQueue,
      maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
      retryStrategy: config.redis.retryStrategy,
      lazyConnect: true,
    });

    redis.on('connect', () => {
      isConnected = true;
      logger.info('Redis connected');
    });

    redis.on('error', (err) => {
      logger.error({ err }, 'Redis error');
      isConnected = false;
    });

    redis.on('close', () => {
      isConnected = false;
      logger.warn('Redis connection closed');
    });
  }
  return redis;
}

export async function connectCache() {
  const client = getRedis();
  if (!isConnected) {
    await client.connect();
  }
  return client;
}

export async function disconnectCache() {
  if (redis && isConnected) {
    await redis.quit();
    redis = null;
    isConnected = false;
  }
}

export function cacheKey(...parts) {
  return `ecoscol:${parts.join(':')}`;
}

export async function getCache(key) {
  const client = getRedis();
  if (!isConnected) return null;
  try {
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    logger.warn({ err, key }, 'Cache get error');
    return null;
  }
}

export async function setCache(key, value, ttlSeconds = 3600) {
  const client = getRedis();
  if (!isConnected) return false;
  try {
    await client.setex(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch (err) {
    logger.warn({ err, key }, 'Cache set error');
    return false;
  }
}

export async function delCache(key) {
  const client = getRedis();
  if (!isConnected) return false;
  try {
    await client.del(key);
    return true;
  } catch (err) {
    logger.warn({ err, key }, 'Cache del error');
    return false;
  }
}

export async function delCachePattern(pattern) {
  const client = getRedis();
  if (!isConnected) return false;
  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
    return true;
  } catch (err) {
    logger.warn({ err, pattern }, 'Cache del pattern error');
    return false;
  }
}

export async function invalidateEcoleCache(ecoleId) {
  await delCachePattern(cacheKey('ecole', ecoleId, '*'));
}

export const CACHE_TTL = {
  ECOLE: 3600,
  CLASSES: 1800,
  MATIERES: 3600,
  NIVEAUX: 3600,
  SERIES: 3600,
  EMPLOI_DU_TEMPS: 3600,
  GRILLE_TARIFAIRE: 1800,
  SEQUENCES: 900,
  ANNEE_ACTIVE: 900,
};

export const CACHE_KEYS = {
  ecole: (ecoleId) => cacheKey('ecole', ecoleId, 'info'),
  classes: (ecoleId, anneeId) => cacheKey('ecole', ecoleId, 'classes', anneeId || 'active'),
  matieres: (ecoleId) => cacheKey('ecole', ecoleId, 'matieres'),
  niveaux: (ecoleId) => cacheKey('ecole', ecoleId, 'niveaux'),
  series: (ecoleId) => cacheKey('ecole', ecoleId, 'series'),
  emploiDuTemps: (ecoleId, classeId) => cacheKey('ecole', ecoleId, 'edt', classeId),
  grilleTarifaire: (ecoleId, anneeId) => cacheKey('ecole', ecoleId, 'grille', anneeId),
  sequences: (ecoleId, anneeId) => cacheKey('ecole', ecoleId, 'sequences', anneeId),
  anneeActive: (ecoleId) => cacheKey('ecole', ecoleId, 'annee_active'),
};