import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { assertWorkshopId, safeJobId } from '@wallpaper-manager/wallpaper-files';
import { Infrastructure } from '../common';

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') throw new BadRequestException({ code: 'BAD_REQUEST', message: '分组名称不能为空' });
  const name = value.normalize('NFC').trim();
  if (!name || name.length > 40) throw new BadRequestException({ code: 'BAD_REQUEST', message: '分组名称需为 1 到 40 个字符' });
  return name;
}

function normalizeColor(value: unknown): string {
  if (value === undefined) return '#4f8cff';
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) throw new BadRequestException({ code: 'BAD_REQUEST', message: '分组颜色格式无效' });
  return value.toLowerCase();
}

function serializeGroup(group: any, playableCount = 0) {
  return { id: group.id, name: group.name, color: group.color, sortOrder: group.sortOrder, itemCount: group._count?.items ?? 0, playableCount, updatedAt: group.updatedAt.toISOString() };
}

@Controller()
export class GroupsController {
  constructor(private readonly infra: Infrastructure) {}

  @Get('groups')
  async list() {
    const [groups, playable, all, ungrouped] = await Promise.all([
      this.infra.db.wallpaperGroup.findMany({ include: { _count: { select: { items: true } } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.infra.db.wallpaperGroupItem ? this.infra.db.wallpaperGroupItem.groupBy({ by: ['groupId'], where: { wallpaper: { status: 'downloaded', type: { in: ['scene', 'web', 'video'] } } }, _count: { _all: true } }) : Promise.resolve([]),
      this.infra.db.wallpaper.count({ where: { status: 'downloaded' } }),
      this.infra.db.wallpaper.count({ where: { status: 'downloaded', groupItems: { none: {} } } }),
    ]);
    const playableCounts = new Map(playable.map((item) => [item.groupId, item._count._all]));
    return { items: groups.map((group) => serializeGroup(group, playableCounts.get(group.id) || 0)), system: { all, ungrouped } };
  }

  @Post('groups')
  async create(@Body() body: { name?: unknown; color?: unknown }) {
    const name = normalizeName(body?.name);
    const normalizedName = name.toLocaleLowerCase();
    const color = normalizeColor(body?.color);
    const previous = await this.infra.db.wallpaperGroup.findUnique({ where: { normalizedName } });
    if (previous) throw new ConflictException({ code: 'CONFLICT', message: '同名分组已存在' });
    const last = await this.infra.db.wallpaperGroup.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const group = await this.infra.db.wallpaperGroup.create({ data: { id: randomUUID(), name, normalizedName, color, sortOrder: (last?.sortOrder ?? -1) + 1 }, include: { _count: { select: { items: true } } } });
    return serializeGroup(group);
  }

  @Patch('groups/:id')
  async update(@Param('id') id: string, @Body() body: { name?: unknown; color?: unknown; sortOrder?: unknown }) {
    safeJobId(id);
    const current = await this.infra.db.wallpaperGroup.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: '分组不存在' });
    const name = body?.name === undefined ? current.name : normalizeName(body.name);
    const normalizedName = name.toLocaleLowerCase();
    if (normalizedName !== current.normalizedName) {
      const duplicate = await this.infra.db.wallpaperGroup.findUnique({ where: { normalizedName } });
      if (duplicate) throw new ConflictException({ code: 'CONFLICT', message: '同名分组已存在' });
    }
    const sortOrder = body?.sortOrder === undefined ? current.sortOrder : Number(body.sortOrder);
    if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) throw new BadRequestException({ code: 'BAD_REQUEST', message: '分组排序值无效' });
    const group = await this.infra.db.wallpaperGroup.update({ where: { id }, data: { name, normalizedName, color: normalizeColor(body?.color), sortOrder }, include: { _count: { select: { items: true } } } });
    return serializeGroup(group);
  }

  @Delete('groups/:id')
  async remove(@Param('id') id: string) {
    safeJobId(id);
    const result = await this.infra.db.wallpaperGroup.deleteMany({ where: { id } });
    if (!result.count) throw new NotFoundException({ code: 'NOT_FOUND', message: '分组不存在' });
    return { deleted: true };
  }

  @Put('wallpapers/:workshopId/groups')
  async assign(@Param('workshopId') workshopId: string, @Body() body: { groupIds?: unknown }) {
    assertWorkshopId(workshopId);
    if (!Array.isArray(body?.groupIds) || body.groupIds.some((id) => typeof id !== 'string')) throw new BadRequestException({ code: 'BAD_REQUEST', message: '分组 ID 列表无效' });
    const groupIds = [...new Set(body.groupIds as string[])];
    groupIds.forEach(safeJobId);
    const wallpaper = await this.infra.db.wallpaper.findUnique({ where: { workshopId }, select: { workshopId: true } });
    if (!wallpaper) throw new NotFoundException({ code: 'NOT_FOUND', message: '壁纸不存在' });
    const groups = await this.infra.db.wallpaperGroup.findMany({ where: { id: { in: groupIds } }, select: { id: true } });
    if (groups.length !== groupIds.length) throw new NotFoundException({ code: 'NOT_FOUND', message: '部分分组不存在' });
    await this.infra.db.$transaction(async (tx) => {
      await tx.wallpaperGroupItem.deleteMany({ where: { workshopId } });
      if (groupIds.length) await tx.wallpaperGroupItem.createMany({ data: groupIds.map((groupId) => ({ groupId, workshopId })) });
    });
    return { workshopId, groupIds };
  }
}
