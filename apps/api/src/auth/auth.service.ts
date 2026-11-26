import { HttpException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Infrastructure } from '../common';
import { matchingTotpStep } from './totp';
import { createSession, sessionFromCookie, validSession } from './session';

@Injectable()
export class AuthService {
  private readonly totpSecret = process.env.AUTH_TOTP_SECRET || '';
  private readonly sessionSecret = process.env.AUTH_SESSION_SECRET || '';
  readonly enabled = Boolean(this.totpSecret && this.sessionSecret);
  readonly sessionTtlSeconds = Number(process.env.AUTH_SESSION_TTL_SECONDS || 43_200);

  constructor(private readonly infra: Infrastructure) {}

  check(cookieHeader: string | undefined): void {
    this.assertConfiguration();
    if (this.enabled && !validSession(sessionFromCookie(cookieHeader), this.sessionSecret)) {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: '请先通过动态验证码登录' });
    }
  }

  async login(code: string): Promise<string | null> {
    this.assertConfiguration();
    if (!this.enabled) return null;
    const attempts = Number(await this.infra.redis.get('auth:login-attempts') || 0);
    if (attempts >= 5) throw new HttpException({ code: 'AUTH_RATE_LIMITED', message: '尝试次数过多，请 15 分钟后再试' }, 429);

    const step = matchingTotpStep(this.totpSecret, code);
    if (step === null || !(await this.claimTotpStep(step))) {
      await this.recordFailure();
      throw new UnauthorizedException({ code: 'AUTH_INVALID', message: '验证码无效、已使用或已过期' });
    }
    await this.infra.redis.del('auth:login-attempts');
    return createSession(this.sessionSecret, Date.now(), this.sessionTtlSeconds);
  }

  private assertConfiguration(): void {
    if (Boolean(this.totpSecret) !== Boolean(this.sessionSecret)) {
      throw new ServiceUnavailableException({ code: 'AUTH_NOT_CONFIGURED', message: '鉴权配置不完整，请同时设置 TOTP 和会话密钥' });
    }
  }

  private async recordFailure(): Promise<void> {
    const attempts = await this.infra.redis.incr('auth:login-attempts');
    if (attempts === 1) await this.infra.redis.expire('auth:login-attempts', 900);
  }

  private claimTotpStep(step: number): Promise<number> {
    return this.infra.redis.eval(
      `local last = tonumber(redis.call('GET', KEYS[1]) or '-1')
       if tonumber(ARGV[1]) <= last then return 0 end
       redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
       return 1`,
      1,
      'auth:last-totp-step',
      String(step),
      String(180_000),
    ) as Promise<number>;
  }
}
