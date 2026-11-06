CREATE TABLE "Wallpaper" (
  "workshopId" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL DEFAULT 'unknown',
  "officialPreviewUrl" TEXT,
  "metadataJson" TEXT NOT NULL DEFAULT '{}',
  "localRelativePath" TEXT,
  "status" TEXT NOT NULL DEFAULT 'not_downloaded',
  "fileSizeBytes" BIGINT,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "downloadedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "DownloadJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workshopId" TEXT NOT NULL,
  "activeWorkshopId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" DATETIME,
  "finishedAt" DATETIME,
  CONSTRAINT "DownloadJob_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Wallpaper" ("workshopId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "SteamAuthState" (
  "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'auth_required',
  "message" TEXT,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "Wallpaper_status_type_idx" ON "Wallpaper"("status", "type");
CREATE INDEX "DownloadJob_workshopId_status_idx" ON "DownloadJob"("workshopId", "status");
CREATE INDEX "DownloadJob_status_createdAt_idx" ON "DownloadJob"("status", "createdAt");
CREATE UNIQUE INDEX "DownloadJob_activeWorkshopId_key" ON "DownloadJob"("activeWorkshopId");
