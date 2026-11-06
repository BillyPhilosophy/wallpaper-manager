import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ApiExceptionFilter, InfrastructureModule } from './common';
import { WallpapersController } from './wallpapers/wallpapers.controller';
import { WorkshopController } from './workshop/workshop.controller';
import { SteamController } from './steam/steam.controller';
import { SystemController } from './system/system.controller';
@Module({ imports: [InfrastructureModule], controllers: [WallpapersController, WorkshopController, SteamController, SystemController], providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }] })
export class AppModule {}
