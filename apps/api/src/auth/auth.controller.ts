import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { clearSessionCookie, sessionCookie } from './session';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('check')
  check(@Req() request: Request, @Res() response: Response): void {
    this.auth.check(request.headers.cookie);
    response.setHeader('Cache-Control', 'no-store');
    response.status(204).end();
  }

  @Post('login')
  async login(@Body() body: { code?: unknown }, @Res() response: Response): Promise<void> {
    const token = await this.auth.login(typeof body?.code === 'string' ? body.code.trim() : '');
    response.setHeader('Cache-Control', 'no-store');
    if (token) response.setHeader('Set-Cookie', sessionCookie(token, this.auth.sessionTtlSeconds));
    response.status(200).json({ ok: true });
  }

  @Post('logout')
  logout(@Res() response: Response): void {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Set-Cookie', clearSessionCookie());
    response.status(204).end();
  }
}
