import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '@/prisma/prisma.module';
import { AiModule } from '@/modules/ai/ai.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { BillingModule } from '@/modules/billing/billing.module';
import { EstimatesModule } from '@/modules/estimates/estimates.module';
import { HealthModule } from '@/modules/health/health.module';
import { IntegrationsModule } from '@/modules/integrations/integrations.module';
import { OrganizationsModule } from '@/modules/organizations/organizations.module';
import { ProjectsModule } from '@/modules/projects/projects.module';
import { RequirementsModule } from '@/modules/requirements/requirements.module';
import { TechStackModule } from '@/modules/tech-stack/tech-stack.module';
import { UserFlowsModule } from '@/modules/user-flows/user-flows.module';
import { WireframesModule } from '@/modules/wireframes/wireframes.module';
import { CodeGenerationModule } from '@/modules/code-generation/code-generation.module';
import { AdminModule } from '@/modules/admin/admin.module';
import { envValidationSchema } from '@/config/env.validation';
import { ThrottlerBehindProxyGuard } from '@/common/guards/throttler-behind-proxy.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { EmailVerifiedGuard } from '@/common/guards/email-verified.guard';
import { SystemRolesGuard } from '@/common/guards/system-roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      validationSchema: envValidationSchema,
      expandVariables: true,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>('THROTTLE_TTL_MS', 60000),
          limit: configService.get<number>('THROTTLE_LIMIT', 100),
        },
      ],
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    ProjectsModule,
    RequirementsModule,
    EstimatesModule,
    TechStackModule,
    UserFlowsModule,
    WireframesModule,
    CodeGenerationModule,
    AiModule,
    BillingModule,
    IntegrationsModule,
    AdminModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: EmailVerifiedGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SystemRolesGuard,
    },
  ],
})
export class AppModule {}
