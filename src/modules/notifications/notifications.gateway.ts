import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: '*'
  }
})
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    try {
      if (!token) throw new Error('Missing token');
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      await client.join(`user:${payload.id}`);
    } catch {
      client.disconnect(true);
    }
  }

  sendToUser(userId: number, payload: unknown): void {
    this.server.to(`user:${userId}`).emit('notification', payload);
  }
}
