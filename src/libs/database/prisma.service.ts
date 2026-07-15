import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL as string
    });
    super({ adapter });
  }

  onModuleInit() {
    this.$connect()
      .then(() => console.log('DB connected'))
      .catch(err => console.log('Error connecting DB'))
  }
}
