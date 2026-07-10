import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL as string
    });
    super({ adapter });
  }

  async onModuleInit() {
    try {
      // 🚨 HARD CHECK: Force connection on startup
      await this.$connect();
      this.logger.log('✅ Connected to Database');
    } catch (error) {
      this.logger.error('❌ Failed to connect to Database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('🛑 Disconnected from Database');
  }
}
