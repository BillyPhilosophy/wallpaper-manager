import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const nodeRequire = createRequire(__filename);
let cachedShim = '';

function cookTemplateLiteral(raw: string): string {
  const simple: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' };
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])/g, (_, escape: string) => {
    if (escape[0] === 'u' && escape.length > 1) return String.fromCodePoint(parseInt(escape[1] === '{' ? escape.slice(2, -1) : escape.slice(1), 16));
    if (escape[0] === 'x' && escape.length === 3) return String.fromCharCode(parseInt(escape.slice(1), 16));
    if (escape === '\n' || escape === '\r\n' || escape === '\r') return '';
    return simple[escape] ?? escape;
  });
}

export function extractWebShim(bundle: string): string {
  const match = /const shimSource = `((?:\\[\s\S]|[^`\\])*)`;/.exec(bundle);
  return match && !/(^|[^\\])\$\{/.test(match[1]) ? cookTemplateLiteral(match[1]) : '';
}

export async function readWebShim(): Promise<string> {
  if (cachedShim) return cachedShim;
  const packageJson = nodeRequire.resolve('webwallgl/package.json');
  const shim = extractWebShim(await fs.readFile(path.join(path.dirname(packageJson), 'webwallgl.mjs'), 'utf8'));
  if (shim) cachedShim = shim;
  return shim;
}

export function injectWebShim(html: string, shim: string, siteRoot: string): string {
  if (!shim || html.includes('data-wm-we-shim')) return html;
  const escapeScript = (value: string) => value.replace(/<\/script/gi, '<\\/script');
  const tags = `<script>window.__weSiteRoot=${JSON.stringify(siteRoot)};</script><script data-wm-we-shim>${escapeScript(shim)}</script>`;
  const head = /<head[^>]*>/i.exec(html);
  return head ? `${html.slice(0, head.index + head[0].length)}${tags}${html.slice(head.index + head[0].length)}` : `${tags}${html}`;
}
