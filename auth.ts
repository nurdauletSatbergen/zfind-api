import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { PrismaService } from './src/libs/database/prisma.service';

const prisma = new PrismaService();

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const role = await prisma.role.findUnique({ where: { name: 'user' } });
          if (role) {
            await prisma.userRole.create({
              data: { userId: user.id, roleId: role.id },
            });
          }
        }
      }
    }
  },
})
