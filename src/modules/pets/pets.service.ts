import { Injectable } from '@nestjs/common';
import { UpdatePetDto } from './dto/update-pet.dto';
import { PrismaService } from '../../libs/database/prisma.service';
import { Prisma } from  '../../generated/prisma/client';


@Injectable()
export class PetsService {
  constructor(
    private prisma: PrismaService
  ) {}

  create(ownerId: number, createPetDto: Prisma.PetCreateWithoutOwnerInput) {
    return this.prisma.pet.create({
      data: {
        ...createPetDto,
        ownerId
      }
    })
  }

  findAll() {
    return this.prisma.pet.findMany();
  }

  findOne(id: number) {
    return `This action returns a #${id} pet`;
  }

  update(id: number, updatePetDto: UpdatePetDto) {
    return `This action updates a #${id} pet`;
  }

  remove(id: number) {
    return `This action removes a #${id} pet`;
  }
}
