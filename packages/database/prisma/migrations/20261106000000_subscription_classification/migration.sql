ALTER TABLE "Wallpaper" ADD COLUMN "contentRating" TEXT NOT NULL DEFAULT 'unrated';
ALTER TABLE "Wallpaper" ADD COLUMN "subscribed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SteamAuthState" ADD COLUMN "steamId" TEXT;
CREATE INDEX "Wallpaper_contentRating_idx" ON "Wallpaper"("contentRating");
CREATE INDEX "Wallpaper_subscribed_idx" ON "Wallpaper"("subscribed");
