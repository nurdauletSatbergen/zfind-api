import { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';

export interface AuthUser extends JwtPayload {
  permissions: string[];
}
