import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { assertWorkshopId } from '@wallpaper-manager/wallpaper-files';
import { CONTENT_RATINGS, WALLPAPER_TYPES } from '@wallpaper-manager/contracts';
import { Infrastructure } from '../common';

function serializeFavorite(item: { workshopId: string; title: string; officialPreviewUrl: string | null; type: string; contentRating: string; createdAt: Date }) {
  return { ...item, createdAt: item.createdAt.toISOString() };
}

@Controller('favorites')
export class FavoritesController {
  constructor(private readonly infra: Infrastructure) {}

  @Get()
  async list(@Query('q') q = '', @Query('page') pageValue = '1', @Query('pageSize') sizeValue = '24') {
    const page = Math.max(Math.trunc(Number(pageValue)) || 1, 1);
    const pageSize = Math.min(Math.max(Math.trunc(Number(sizeValue)) || 24, 1), 100);
    const where = q ? { OR: [{ title: { contains: q.slice(0, 100) } }, { workshopId: { contains: q.slice(0, 100) } }] } : {};
    const [items, total] = await Promise.all([
      this.infra.db.favorite.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.infra.db.favorite.count({ where }),
    ]);
    return { items: items.map(serializeFavorite), page, pageSize, total };
  }

  @Post(':workshopId') @HttpCode(201)
  async add(@Param('workshopId') id: string, @Body() body: { title?: unknown; officialPreviewUrl?: unknown; type?: unknown; contentRating?: unknown } = {}) {
    assertWorkshopId(id);
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.slice(0, 300) : `工坊壁纸 ${id}`;
    const officialPreviewUrl = typeof body.officialPreviewUrl === 'string' && body.officialPreviewUrl ? body.officialPreviewUrl.slice(0, 1000) : null;
    const type = WALLPAPER_TYPES.includes(body.type as any) ? (body.type as string) : 'unknown';
    const contentRating = CONTENT_RATINGS.includes(body.contentRating as any) ? (body.contentRating as string) : 'unrated';
    const fav = await this.infra.db.favorite.upsert({ where: { workshopId: id }, update: {}, create: { workshopId: id, title, officialPreviewUrl, type, contentRating } });
    return serializeFavorite(fav);
  }

  @Delete(':workshopId') @HttpCode(200)
  async remove(@Param('workshopId') id: string) {
    assertWorkshopId(id);
    const result = await this.infra.db.favorite.deleteMany({ where: { workshopId: id } });
    return { deleted: result.count };
  }
}
