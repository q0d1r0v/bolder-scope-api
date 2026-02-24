import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { SKIP_RESPONSE_WRAP_KEY } from '@/common/decorators/skip-response-wrap.decorator';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_WRAP_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skip) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => ({
        success: true,
        ...this.extractPayload(data),
        timestamp: new Date().toISOString(),
      })),
    );
  }

  private extractPayload(data: unknown): Record<string, unknown> {
    if (data === null || data === undefined) {
      return { data: null };
    }

    if (typeof data !== 'object') {
      return { data };
    }

    const obj = data as Record<string, unknown>;

    if ('data' in obj && 'meta' in obj) {
      return { data: obj.data, meta: obj.meta };
    }

    if ('message' in obj && Object.keys(obj).length === 1) {
      return { message: obj.message };
    }

    return { data };
  }
}
