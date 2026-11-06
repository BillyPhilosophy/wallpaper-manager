import { Controller, Get } from '@nestjs/common';
import { Infrastructure } from '../common';
@Controller()
export class SystemController {
  constructor(private readonly infra: Infrastructure) {}
  @Get('health')
  async health() { await this.infra.db.$queryRaw`SELECT 1`; await this.infra.redis.ping(); return { status: 'ok' }; }
  @Get('system/capabilities')
  async capabilities() { const state = await this.infra.db.steamAuthState.findUnique({ where: { id: 1 } }); return { workerReady: await this.infra.redis.ping() === 'PONG', steamAuthenticated: state?.status === 'authenticated', steamApiKeyConfigured: Boolean(process.env.STEAM_WEB_API_KEY), livePreviewTypes: ['scene', 'web'], webwallglVersion: '3.0.0' }; }
}
