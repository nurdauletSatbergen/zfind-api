import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

const ALL_PERMISSIONS = [
  'pets:create',
  'pets:read',
  'pets:update',
  'pets:delete',
  'pets:manage-any',
  'users:read',
  'users:manage',
];

const USER_PERMISSIONS = ['pets:create', 'pets:read', 'pets:update', 'pets:delete'];

async function main() {
  for (const name of ALL_PERMISSIONS) {
    await prisma.permission.upsert({ where: { name }, update: {}, create: { name } });
  }

  await prisma.role.upsert({
    where: { name: 'admin' },
    update: { permissions: { set: ALL_PERMISSIONS.map((name) => ({ name })) } },
    create: { name: 'admin', permissions: { connect: ALL_PERMISSIONS.map((name) => ({ name })) } },
  });

  await prisma.role.upsert({
    where: { name: 'user' },
    update: { permissions: { set: USER_PERMISSIONS.map((name) => ({ name })) } },
    create: { name: 'user', permissions: { connect: USER_PERMISSIONS.map((name) => ({ name })) } },
  });

  console.log('Seed completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
