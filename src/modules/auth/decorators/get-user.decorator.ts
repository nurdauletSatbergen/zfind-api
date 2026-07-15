import { createParamDecorator } from '@nestjs/common';
import { User } from '../../../generated/prisma/client';


export const GetUser = createParamDecorator(
  (_data, context): Omit<User, "password"> => {
    return context.switchToHttp().getRequest().user;
  }
)
