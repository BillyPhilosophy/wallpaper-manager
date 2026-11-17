CREATE TABLE "WallpaperGroup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#4f8cff',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "WallpaperGroup_normalizedName_key" ON "WallpaperGroup"("normalizedName");
CREATE TABLE "WallpaperGroupItem" (
  "groupId" TEXT NOT NULL,
  "workshopId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WallpaperGroupItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WallpaperGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WallpaperGroupItem_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Wallpaper" ("workshopId") ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY ("groupId", "workshopId")
);
CREATE INDEX "WallpaperGroupItem_workshopId_idx" ON "WallpaperGroupItem"("workshopId");
CREATE INDEX "WallpaperGroupItem_groupId_sortOrder_idx" ON "WallpaperGroupItem"("groupId", "sortOrder");
