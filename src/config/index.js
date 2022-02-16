import dotenv from 'dotenv';

// Set the NODE_ENV to 'development' by default
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const envFound = dotenv.config();
let envs;

if (!('error' in envFound)) {
  envs = envFound.parsed;
} else {
  envs = {};
  _.each(process.env, (value, key) => envs[key] = value);
}

export default {
  /**
   * Your favorite port
   */ 
  port: parseInt(process.env.PORT, 10),

  pg: {
    user: process.env.PG_USER,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
    host: process.env.PG_HOST
  },

  /**
   * Used by winston logger
   */
  logs: {
    level: process.env.LOG_LEVEL || 'silly',
  },

  /**
   * API configs
   */
  api: {
    prefix: '/api',
  },
};