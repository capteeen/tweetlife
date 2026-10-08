-- Relationships: bonds (talking / dating, with AI resident affinity) and requests (invite, visit, ask out, date).
CREATE TABLE "Bond" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "partnerId" TEXT,
    "residentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'talking',
    "affinity" INTEGER NOT NULL DEFAULT 0,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "datingSince" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastDateAt" TIMESTAMP(3),
    "dates" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Bond_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialRequest" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT,
    "residentId" TEXT,
    "kind" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "passUntil" TIMESTAMP(3),
    CONSTRAINT "SocialRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Bond_playerId_partnerId_key" ON "Bond"("playerId", "partnerId");
CREATE UNIQUE INDEX "Bond_playerId_residentId_key" ON "Bond"("playerId", "residentId");
CREATE INDEX "Bond_partnerId_idx" ON "Bond"("partnerId");
CREATE INDEX "Bond_playerId_status_idx" ON "Bond"("playerId", "status");
CREATE INDEX "SocialRequest_toId_status_idx" ON "SocialRequest"("toId", "status");
CREATE INDEX "SocialRequest_fromId_status_idx" ON "SocialRequest"("fromId", "status");
CREATE INDEX "SocialRequest_fromId_toId_kind_idx" ON "SocialRequest"("fromId", "toId", "kind");

ALTER TABLE "Bond" ADD CONSTRAINT "Bond_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bond" ADD CONSTRAINT "Bond_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialRequest" ADD CONSTRAINT "SocialRequest_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialRequest" ADD CONSTRAINT "SocialRequest_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
