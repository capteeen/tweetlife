-- Suggestions citizens file with their president, and who backed them.
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'review',
    "reply" TEXT,
    "backers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SuggestionBacker" (
    "suggestionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuggestionBacker_pkey" PRIMARY KEY ("suggestionId","playerId")
);

CREATE INDEX "Suggestion_country_status_backers_idx" ON "Suggestion"("country", "status", "backers");
CREATE INDEX "Suggestion_playerId_createdAt_idx" ON "Suggestion"("playerId", "createdAt");

ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SuggestionBacker" ADD CONSTRAINT "SuggestionBacker_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "Suggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SuggestionBacker" ADD CONSTRAINT "SuggestionBacker_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
