import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  check() {
    return {
      status: 'ok',
      service: 'bolder-scope-api',
      timestamp: new Date().toISOString(),
    };
  }
}
