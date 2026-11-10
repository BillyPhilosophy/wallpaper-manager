CREATE TABLE "Favorite" (
    "workshopId" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "officialPreviewUrl" TEXT,
    "type" TEXT NOT NULL DEFAULT 'unknown',
    "contentRating" TEXT NOT NULL DEFAULT 'unrated',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Favorite_createdAt_idx" ON "Favorite"("createdAt");

-- 清理旧 detail() upsert 产生的垃圾行：
-- 保留订阅行(subscribed=1)、已下载/进行中行(status != 'not_downloaded')、被收藏行。
-- 首次运行时 Favorite 为空，NOT IN 子查询退化为 status/subscribed 谓词（表已在上方建好）。
-- 注意：被删的 not_downloaded 行若有残留 DownloadJob，会因 onDelete:Cascade 一并删除（本就是垃圾，可接受）。
DELETE FROM "Wallpaper"
WHERE "status" = 'not_downloaded'
  AND "subscribed" = 0
  AND "workshopId" NOT IN (SELECT "workshopId" FROM "Favorite");
