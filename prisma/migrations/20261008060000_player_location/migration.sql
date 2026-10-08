-- Where the player is right now: a country id from lib/world/countries.ts. Null = at home.
ALTER TABLE "Player" ADD COLUMN "location" TEXT;
