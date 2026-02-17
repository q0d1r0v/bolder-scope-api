import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  APP_URL: Joi.string().uri().optional(),
  DATABASE_URL: Joi.string().optional(),
  JWT_ACCESS_SECRET: Joi.string().min(16).default('dev_access_secret_change_me_please'),
  JWT_ACCESS_TTL_SECONDS: Joi.number().integer().min(60).default(900),
  JWT_REFRESH_SECRET: Joi.string().min(16).default('dev_refresh_secret_change_me_please'),
  JWT_REFRESH_TTL_SECONDS: Joi.number().integer().min(300).default(2592000),
  JWT_EMAIL_VERIFICATION_SECRET: Joi.string()
    .min(16)
    .default('dev_email_verification_secret_change_me_please'),
  JWT_EMAIL_VERIFICATION_TTL_SECONDS: Joi.number().integer().min(300).default(86400),
  EMAIL_VERIFICATION_URL: Joi.string().uri().optional(),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
  SENDGRID_API_KEY: Joi.string().optional(),
  SENDGRID_FROM_EMAIL: Joi.string().email().optional(),
  SWAGGER_ENABLED: Joi.boolean().default(true),
  SWAGGER_PATH: Joi.string().default('docs'),
  SWAGGER_USERNAME: Joi.string().min(3).default('swagger_admin'),
  SWAGGER_PASSWORD: Joi.string().min(8).default('change-me-swagger-password'),
  THROTTLE_TTL_MS: Joi.number().integer().min(1000).default(60000),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(100),
});
