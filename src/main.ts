import { ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { NextFunction, Request, Response, json, urlencoded } from 'express';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '@/app.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { ResponseInterceptor } from '@/common/interceptors/response.interceptor';

const parseCorsOrigins = (origins: string): string[] => {
  return origins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
};

const isCorsOriginAllowed = (
  origin: string | undefined,
  allowedOrigins: string[],
): boolean => {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes('*')) {
    return true;
  }

  return allowedOrigins.includes(origin);
};

const parseBasicAuthHeader = (
  authorizationHeader: string | undefined,
): { username: string; password: string } | null => {
  if (!authorizationHeader?.startsWith('Basic ')) {
    return null;
  }

  const base64Credentials = authorizationHeader.slice(6).trim();
  if (!base64Credentials) {
    return null;
  }

  try {
    const decodedCredentials = Buffer.from(
      base64Credentials,
      'base64',
    ).toString('utf8');
    const separatorIndex = decodedCredentials.indexOf(':');

    if (separatorIndex === -1) {
      return null;
    }

    return {
      username: decodedCredentials.slice(0, separatorIndex),
      password: decodedCredentials.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
};

const createSwaggerAuthMiddleware = (username: string, password: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const credentials = parseBasicAuthHeader(req.headers.authorization);

    if (
      credentials?.username === username &&
      credentials.password === password
    ) {
      next();
      return;
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="Swagger Docs"');
    res.status(401).send('Authentication required.');
  };
};

const normalizePath = (path: string): string => {
  const trimmedPath = path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return `/${trimmedPath || 'docs'}`;
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableShutdownHooks();
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      stopAtFirstError: true,
    }),
  );

  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.disable('x-powered-by');
  httpAdapter.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  const corsOrigins = parseCorsOrigins(
    process.env.CORS_ORIGINS ?? 'http://localhost:3000',
  );
  app.enableCors({
    origin: (origin, callback) => {
      callback(null, isCorsOriginAllowed(origin, corsOrigins));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept',
      'X-Requested-With',
    ],
  });

  app.setGlobalPrefix('api/v1');

  const isDevelopment =
    (process.env.NODE_ENV ?? 'development').toLowerCase() === 'development';
  const swaggerEnabled =
    isDevelopment &&
    (process.env.SWAGGER_ENABLED ?? 'true').toLowerCase() !== 'false';

  if (swaggerEnabled) {
    const swaggerPath =
      (process.env.SWAGGER_PATH ?? 'docs').replace(/^\/+|\/+$/g, '') || 'docs';
    const swaggerRoute = normalizePath(swaggerPath);
    const swaggerUsername = process.env.SWAGGER_USERNAME ?? 'swagger_admin';
    const swaggerPassword =
      process.env.SWAGGER_PASSWORD ?? 'change-me-swagger-password';

    app.use(
      [swaggerRoute, `${swaggerRoute}-json`],
      createSwaggerAuthMiddleware(swaggerUsername, swaggerPassword),
    );

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Bolder Scope API')
      .setDescription(
        'AI-powered requirement, estimate, and prototype platform API',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          in: 'header',
        },
        'bearer',
      )
      .addServer('/api/v1')
      .build();

    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(swaggerPath, app, swaggerDocument, {
      customSiteTitle: 'Bolder Scope API Docs',
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
  }

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
