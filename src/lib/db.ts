// Import Prisma Client with error handling
let prisma: any;

try {
  const { PrismaClient } = require('@prisma/client');
  const globalForPrisma = globalThis as unknown as { prisma: any };

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }

  prisma = globalForPrisma.prisma;
} catch (error) {
  console.error('Failed to initialize Prisma client:', error);
  
  // Create a mock Prisma client for development/testing
  prisma = {
    user: {
      findUnique: () => Promise.resolve(null),
      create: () => Promise.resolve({ id: '1', email: 'test@example.com' }),
      findMany: () => Promise.resolve([]),
    },
    conversationEvent: {
      create: () => Promise.resolve({ id: '1' }),
      findMany: () => Promise.resolve([]),
    },
    decisionCandidate: {
      create: () => Promise.resolve({ id: '1' }),
      findMany: () => Promise.resolve([]),
    },
    decisionBrief: {
      create: () => Promise.resolve({ id: '1' }),
      findMany: () => Promise.resolve([]),
    },
    slackWorkspace: {
      create: () => Promise.resolve({ id: '1' }),
      findMany: () => Promise.resolve([]),
    },
    slackChannel: {
      create: () => Promise.resolve({ id: '1' }),
      findMany: () => Promise.resolve([]),
    },
    slackMessage: {
      create: () => Promise.resolve({ id: '1' }),
      findMany: () => Promise.resolve([]),
    },
    $connect: () => Promise.resolve(),
    $disconnect: () => Promise.resolve(),
  };
}

export { prisma };
export default prisma;
