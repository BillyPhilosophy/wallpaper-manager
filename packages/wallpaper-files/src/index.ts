import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ContentRating, PreviewDescriptor, WallpaperType } from '@wallpaper-manager/contracts';

export class WallpaperFileError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'WallpaperFileError'; }
}
export function assertWorkshopId(value: string): string {
  if (!/^[0-9]+$/.test(value)) throw new WallpaperFileError('BAD_REQUEST', '无效的工坊 ID');
  return value;
}
export function workshopRoot(steamRoot: string): string {
  return path.join(steamRoot, 'steamapps', 'workshop', 'content', '431960');
}
export function wallpaperDirectory(steamRoot: string, workshopId: string): string {
  return path.join(workshopRoot(steamRoot), assertWorkshopId(workshopId));
}
export function safeJobId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new WallpaperFileError('BAD_REQUEST', '无效的任务 ID');
  return value;
}
export function stagingWorkshopDirectory(stagingDir: string, jobId: string, workshopId: string): string {
  return path.join(stagingDir, safeJobId(jobId), 'steamapps', 'workshop', 'content', '431960', assertWorkshopId(workshopId));
}

export interface ProjectInfo { type: WallpaperType; contentRating: ContentRating; entry: string | null; project: Record<string, unknown> }
function stringValue(value: unknown): string | undefined { return typeof value === 'string' && value.length ? value : undefined; }
export function contentRating(value: unknown): ContentRating {
  const rating = stringValue(value)?.toLowerCase();
  return rating === 'g' || rating === 'everyone' ? 'everyone' : rating === 'pg13' ? 'pg13' : rating === 'r' || rating === 'mature' ? 'mature' : 'unrated';
}
export async function inspectWallpaper(directory: string): Promise<ProjectInfo> {
  const raw = await fs.readFile(path.join(directory, 'project.json'), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') throw new WallpaperFileError('INVALID_PROJECT', '缺少 project.json');
    throw error;
  });
  let project: Record<string, unknown>;
  try { project = JSON.parse(raw); } catch { throw new WallpaperFileError('INVALID_PROJECT', 'project.json 不是合法 JSON'); }
  if (!project || Array.isArray(project) || typeof project !== 'object') throw new WallpaperFileError('INVALID_PROJECT', 'project.json 格式无效');
  const type = stringValue(project.type)?.toLowerCase();
  const rating = contentRating(project.contentrating);
  const files = await fs.readdir(directory);
  if (type === 'application') throw new WallpaperFileError('UNSUPPORTED_TYPE', '不支持 Application／EXE 壁纸');
  if (type === 'video') {
    const entry = stringValue(project.file);
    if (!entry) throw new WallpaperFileError('RESOURCE_MISSING', '视频入口缺失');
    return { type: 'video', contentRating: rating, entry: safeRelativePath(entry), project };
  }
  if (type === 'web') {
    const entry = stringValue(project.file);
    if (!entry || !/\.html?$/i.test(entry)) throw new WallpaperFileError('RESOURCE_MISSING', '网页入口缺失');
    const safe = safeRelativePath(entry);
    if (!(await isRegularFile(path.join(directory, safe)))) throw new WallpaperFileError('RESOURCE_MISSING', '网页入口文件不存在');
    return { type: 'web', contentRating: rating, entry: safe, project };
  }
  if (type === 'image') {
    const entry = stringValue(project.file);
    if (!entry || !/\.(png|jpe?g|gif|webp|bmp)$/i.test(entry)) throw new WallpaperFileError('RESOURCE_MISSING', '图片入口缺失');
    const safe = safeRelativePath(entry);
    if (!(await isRegularFile(path.join(directory, safe)))) throw new WallpaperFileError('RESOURCE_MISSING', '图片入口文件不存在');
    return { type: 'image', contentRating: rating, entry: safe, project };
  }
  if (type === 'scene') {
    const declared = stringValue(project.file);
    const candidates = declared ? [declared] : ['scene.pkg', 'scene.json', ...files.filter((f) => f.endsWith('.pkg'))];
    const existing: string[] = [];
    for (const candidate of [...new Set(candidates)]) {
      const safe = safeRelativePath(candidate);
      if (await isRegularFile(path.join(directory, safe))) existing.push(safe);
    }
    if (!existing.length) throw new WallpaperFileError('RESOURCE_MISSING', 'Scene 入口不存在');
    const preferred = existing.find((f) => f === 'scene.pkg') ?? existing.find((f) => f === 'scene.json') ?? existing[0];
    return { type: 'scene', contentRating: rating, entry: preferred, project };
  }
  return { type: 'unknown', contentRating: rating, entry: null, project };
}
async function isRegularFile(file: string): Promise<boolean> { try { return (await fs.lstat(file)).isFile() && !(await fs.lstat(file)).isSymbolicLink(); } catch { return false; } }

export function safeRelativePath(input: string): string {
  if (!input || input.includes('\0') || input.includes('\\') || path.posix.isAbsolute(input) || path.win32.isAbsolute(input)) throw new WallpaperFileError('PATH_UNSAFE', '资源路径不安全');
  let decoded: string;
  try { decoded = decodeURIComponent(input); if (decodeURIComponent(decoded) !== decoded) throw new WallpaperFileError('PATH_UNSAFE', '不接受双重编码资源路径'); } catch (error) { if (error instanceof WallpaperFileError) throw error; throw new WallpaperFileError('PATH_UNSAFE', '资源路径编码无效'); }
  if (decoded.includes('\0') || decoded.includes('\\') || path.posix.isAbsolute(decoded) || path.win32.isAbsolute(decoded)) throw new WallpaperFileError('PATH_UNSAFE', '资源路径不安全');
  const normalized = path.posix.normalize(decoded);
  if (normalized !== decoded || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../') || decoded.split('/').some((part) => !part || part === '.' || part === '..')) throw new WallpaperFileError('PATH_UNSAFE', '资源路径不安全');
  return normalized;
}
function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
export async function resolveResourcePath(steamRoot: string, workshopId: string, relativePath: string): Promise<string> {
  const root = await fs.realpath(workshopRoot(steamRoot));
  const directory = await fs.realpath(path.join(root, assertWorkshopId(workshopId)));
  if (!isInside(root, directory) || path.basename(directory) !== workshopId) throw new WallpaperFileError('PATH_UNSAFE', '壁纸目录不安全');
  const safe = safeRelativePath(relativePath);
  const candidate = path.resolve(directory, ...safe.split('/'));
  if (!isInside(directory, candidate)) throw new WallpaperFileError('PATH_UNSAFE', '资源路径越界');
  let real: string;
  try { real = await fs.realpath(candidate); } catch { throw new WallpaperFileError('NOT_FOUND', '资源不存在'); }
  if (!isInside(directory, real) || !(await fs.stat(real)).isFile()) throw new WallpaperFileError('PATH_UNSAFE', '资源不存在或符号链接越界');
  return real;
}
export async function assertSafeTree(directory: string): Promise<void> {
  const root = await fs.realpath(directory);
  async function walk(current: string): Promise<void> {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        const real = await fs.realpath(full);
        if (!isInside(root, real)) throw new WallpaperFileError('PATH_UNSAFE', '下载目录含危险符号链接');
        throw new WallpaperFileError('PATH_UNSAFE', '下载目录不接受符号链接');
      }
      if (entry.isDirectory()) await walk(full);
      else if (!entry.isFile()) throw new WallpaperFileError('PATH_UNSAFE', '下载目录含特殊文件');
    }
  }
  await walk(root);
}
export async function directorySize(directory: string): Promise<bigint> {
  let total = 0n;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directorySize(full);
    else if (entry.isFile()) total += BigInt((await fs.stat(full)).size);
  }
  return total;
}
export async function publishDirectory(source: string, steamRoot: string, workshopId: string): Promise<string> {
  await assertSafeTree(source);
  const destination = wallpaperDirectory(steamRoot, workshopId);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try { await fs.lstat(destination); throw new WallpaperFileError('PUBLISH_CONFLICT', '目标壁纸已存在'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await fs.rename(source, destination);
  return destination;
}
export async function moveToTrash(steamRoot: string, trashDir: string, workshopId: string, deleteJobId: string = randomUUID()): Promise<string> {
  const source = wallpaperDirectory(steamRoot, workshopId);
  const target = path.join(trashDir, safeJobId(deleteJobId), assertWorkshopId(workshopId));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rename(source, target);
  return target;
}
export function previewDescriptor(workshopId: string, type: WallpaperType, entry: string | null, fallbackPreviewUrl: string | null, downloaded: boolean): PreviewDescriptor {
  const fallback = { workshopId, type, fallbackPreviewUrl };
  if (!downloaded) return { ...fallback, mode: 'official-preview', degraded: false, message: '下载后可使用实时预览' };
  if (type === 'scene' && entry) return { ...fallback, mode: 'webwallgl', resourceBaseUrl: `/api/wallpapers/${workshopId}/resources`, entry, degraded: false, message: null };
  if (type === 'web' && entry) return { ...fallback, mode: 'web-sandbox', resourceBaseUrl: `/api/wallpapers/${workshopId}/resources`, entry, degraded: false, message: null };
  return { ...fallback, mode: 'official-preview', degraded: true, message: '该类型不支持浏览器实时预览' };
}
export function sanitizeError(error: unknown): { code: string; message: string } {
  const code = error instanceof WallpaperFileError ? error.code : (error as NodeJS.ErrnoException)?.code === 'ENOSPC' ? 'DISK_FULL' : 'INTERNAL_ERROR';
  const message = error instanceof WallpaperFileError ? error.message : code === 'DISK_FULL' ? '磁盘空间不足' : '操作失败，请稍后重试';
  return { code, message: message.replace(/(password|guard|code)\s*[=:]\s*\S+/gi, '$1=[redacted]').slice(0, 500) };
}
