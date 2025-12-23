import { createClient } from 'redis';
import logger from '../utils/logger.js';

let redisClient;

const connectRedis = async () => {
  try {
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST || '127.0.0.1', // 🔥 FIX
        port: Number(process.env.REDIS_PORT) || 6379,
        connectTimeout: 10_000, // 🔥 prevent infinite wait
        reconnectStrategy: (retries) => {
          if (retries > 2) {
            logger.error('Redis reconnect failed after 5 attempts');
            return new Error('Redis reconnect failed');
          }
          return Math.min(retries * 500, 3000);
        },
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    redisClient.on('connect', () => {
      logger.info('🔄 Redis connecting...');
    });

    redisClient.on('ready', () => {
      logger.info('✅ Redis ready');
    });

    redisClient.on('error', (err) => {
      logger.error('❌ Redis Client Error:', err.message);
    });

    redisClient.on('end', () => {
      logger.warn('⚠️ Redis connection closed');
    });

    await redisClient.connect();

    // Hard verification
    await redisClient.ping();

    return redisClient;
  } catch (error) {
    logger.error('❌ Redis connection failed:', error.message);

    if (process.env.NODE_ENV === 'production') {
      throw error;
    }

    logger.warn('⚠️ Continuing without Redis (dev mode)');
    redisClient = null;
    return null;
  }
};

const getRedisClient = () => {
  if (!redisClient) {
    logger.warn('⚠️ Redis client not available');
  }
  return redisClient;
};

export { connectRedis, getRedisClient };
export default connectRedis;
// import { createClient } from 'redis';
// import logger from '../utils/logger.js';

// let redisClient = null;

// const connectRedis = async () => {
//   try {
//     redisClient = createClient({
//       socket: {
//         host: process.env.REDIS_HOST || 'localhost',
//         port: process.env.REDIS_PORT || 6379,
//       },
//       password: process.env.REDIS_PASSWORD || undefined,
//     });

//     redisClient.on('error', (err) => {
//       logger.error('Redis Client Error:', err);
//     });

//     redisClient.on('connect', () => {
//       logger.info('Redis Client Connecting...');
//     });

//     redisClient.on('ready', () => {
//       logger.info('Redis Client Ready');
//     });

//     await redisClient.connect();
//     return redisClient;
//   } catch (error) {
//     logger.error('Redis connection failed:', error);
//     // Don't throw - allow app to run without Redis in development
//     if (process.env.NODE_ENV === 'production') {
//       throw error;
//     }
//     return null;
//   }
// };

// const getRedisClient = () => {
//   if (!redisClient) {
//     logger.warn('Redis client not initialized');
//   }
//   return redisClient;
// };

// export { connectRedis, getRedisClient };
// export default connectRedis;

