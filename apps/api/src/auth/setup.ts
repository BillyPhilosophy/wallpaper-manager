import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { generateTotpSecret } from './totp';

async function main() {
  const secret = generateTotpSecret();
  const sessionSecret = randomBytes(32).toString('base64url');
  const issuer = 'WallpaperManager';
  const uri = `otpauth://totp/${issuer}:admin?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  const qr = await QRCode.toString(uri, { type: 'terminal', small: true });
  console.log('\n使用 Google Authenticator 或其他 TOTP 应用扫描以下二维码：\n');
  console.log(qr);
  console.log('将下面两行加入 deploy/.env（会覆盖旧值，已有会话也会失效）：\n');
  console.log(`AUTH_TOTP_SECRET=${secret}`);
  console.log(`AUTH_SESSION_SECRET=${sessionSecret}`);
  console.log('\n请离线备份 TOTP 密钥。二维码和密钥均属于敏感信息，不要提交或写入日志。');
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '生成鉴权配置失败');
  process.exitCode = 1;
});
