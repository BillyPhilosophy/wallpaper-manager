import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { parseApiEnv } from '@wallpaper-manager/config';
import { AppModule } from './app.module';
async function bootstrap() {
  const env = parseApiEnv(); const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  app.setGlobalPrefix('api'); app.use(json({ limit: env.REQUEST_BODY_LIMIT })); app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
}
void bootstrap();
