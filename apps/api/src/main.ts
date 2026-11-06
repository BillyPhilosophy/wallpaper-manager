import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { parseApiEnv } from '@wallpaper-manager/config';
import { AppModule } from './app.module';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
async function bootstrap() {
  const env = parseApiEnv();
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxy) { setGlobalDispatcher(new EnvHttpProxyAgent()); console.log(`[proxy] enabled protocol=${new URL(proxy).protocol}`); } const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  app.setGlobalPrefix('api'); app.use(json({ limit: env.REQUEST_BODY_LIMIT })); app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
}
void bootstrap();
