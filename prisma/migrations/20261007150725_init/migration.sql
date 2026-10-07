-- CreateEnum
CREATE TYPE "IngestState" AS ENUM ('queued', 'building', 'live', 'failed');

-- CreateEnum
CREATE TYPE "Access" AS ENUM ('followers', 'public', 'invite');

-- CreateEnum
CREATE TYPE "StructureKind" AS ENUM ('pillar', 'spire', 'monolith', 'obelisk', 'outbuilding', 'lantern');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'dead');

-- CreateEnum
CREATE TYPE "RunKind" AS ENUM ('first_build', 'incremental', 'metrics_refresh');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "World" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "xUserId" TEXT NOT NULL,
    "accountCreatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "biome" TEXT NOT NULL DEFAULT 'meadow',
    "access" "Access" NOT NULL DEFAULT 'followers',
    "listedOnExplore" BOOLEAN NOT NULL DEFAULT false,
    "landmarkPostId" TEXT,
    "followersCount" INTEGER NOT NULL DEFAULT 0,
    "followingCount" INTEGER NOT NULL DEFAULT 0,
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" TIMESTAMP(3),
    "nextSyncAt" TIMESTAMP(3),
    "ingestState" "IngestState" NOT NULL DEFAULT 'queued',
    "ingestError" TEXT,
    "newestPostId" TEXT,
    "oldestPostId" TEXT,
    "showReplies" BOOLEAN NOT NULL DEFAULT true,
    "showMetrics" BOOLEAN NOT NULL DEFAULT true,
    "chatEnabled" BOOLEAN NOT NULL DEFAULT false,
    "paths" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "World_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Structure" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "kind" "StructureKind" NOT NULL,
    "conversationId" TEXT,
    "referencedId" TEXT,
    "text" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaKind" TEXT,
    "likes" INTEGER,
    "reposts" INTEGER,
    "replies" INTEGER,
    "impressions" INTEGER,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "lanternsLit" INTEGER NOT NULL DEFAULT 0,
    "metricsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Structure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mark" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "byHandle" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "z" DOUBLE PRECISION NOT NULL,
    "bright" BOOLEAN NOT NULL DEFAULT false,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lantern" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lantern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorSession" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "visitorHandle" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "z" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "VisitorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestRun" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "kind" "RunKind" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "postsWritten" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "jobId" TEXT,

    CONSTRAINT "IngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCall" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "endpoint" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "rateLimitRemaining" INTEGER,
    "rateLimitReset" TIMESTAMP(3),
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "ApiCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelapseJob" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "filePath" TEXT,
    "error" TEXT,

    CONSTRAINT "TimelapseJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "World_handle_key" ON "World"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "World_xUserId_key" ON "World"("xUserId");

-- CreateIndex
CREATE INDEX "World_listedOnExplore_access_idx" ON "World"("listedOnExplore", "access");

-- CreateIndex
CREATE INDEX "Structure_worldId_postedAt_idx" ON "Structure"("worldId", "postedAt");

-- CreateIndex
CREATE INDEX "Structure_worldId_conversationId_idx" ON "Structure"("worldId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Structure_worldId_postId_key" ON "Structure"("worldId", "postId");

-- CreateIndex
CREATE INDEX "Mark_worldId_at_idx" ON "Mark"("worldId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Mark_worldId_byUserId_key" ON "Mark"("worldId", "byUserId");

-- CreateIndex
CREATE INDEX "Lantern_worldId_at_idx" ON "Lantern"("worldId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Lantern_structureId_byUserId_key" ON "Lantern"("structureId", "byUserId");

-- CreateIndex
CREATE INDEX "VisitorSession_worldId_joinedAt_idx" ON "VisitorSession"("worldId", "joinedAt");

-- CreateIndex
CREATE INDEX "IngestRun_worldId_startedAt_idx" ON "IngestRun"("worldId", "startedAt");

-- CreateIndex
CREATE INDEX "IngestRun_status_idx" ON "IngestRun"("status");

-- CreateIndex
CREATE INDEX "ApiCall_at_idx" ON "ApiCall"("at");

-- CreateIndex
CREATE INDEX "ApiCall_endpoint_at_idx" ON "ApiCall"("endpoint", "at");

-- CreateIndex
CREATE INDEX "TimelapseJob_worldId_startedAt_idx" ON "TimelapseJob"("worldId", "startedAt");

-- AddForeignKey
ALTER TABLE "World" ADD CONSTRAINT "World_xUserId_fkey" FOREIGN KEY ("xUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Structure" ADD CONSTRAINT "Structure_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lantern" ADD CONSTRAINT "Lantern_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lantern" ADD CONSTRAINT "Lantern_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "Structure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lantern" ADD CONSTRAINT "Lantern_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorSession" ADD CONSTRAINT "VisitorSession_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestRun" ADD CONSTRAINT "IngestRun_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiCall" ADD CONSTRAINT "ApiCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelapseJob" ADD CONSTRAINT "TimelapseJob_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
