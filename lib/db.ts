import { PrismaClient } from '@prisma/client';
import { pooledDatabaseUrl } from './db-url';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: pooledDatabaseUrl(),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

// Kept on globalThis in production too, so route bundles that each import this module share one client and one pool.
globalForPrisma.prisma = db;
