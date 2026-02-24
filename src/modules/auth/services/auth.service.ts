import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrganizationRole,
  OrganizationType,
  Prisma,
  SystemRole,
  UserStatus,
} from '@prisma/client';
import {
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { EmailIntegrationService } from '@/modules/integrations/email/services/email-integration.service';
import { PrismaService } from '@/prisma/prisma.service';
import { LoginDto } from '@/modules/auth/dto/login.dto';
import { RefreshTokenDto } from '@/modules/auth/dto/refresh-token.dto';
import { AuthAccountRole, RegisterDto } from '@/modules/auth/dto/register.dto';
import { VerifyEmailDto } from '@/modules/auth/dto/verify-email.dto';

const scryptAsync = promisify(scryptCallback);
const PASSWORD_HASH_KEY_LENGTH = 64;
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type JwtPayload = {
  sub: string;
  email: string;
  systemRole: SystemRole;
  isEmailVerified: boolean;
  organizationId?: string;
  organizationRole?: OrganizationRole;
  organizationType?: OrganizationType;
  type: 'access';
  iat: number;
  exp: number;
};

type EmailVerificationJwtPayload = {
  sub: string;
  email: string;
  type: 'email_verification';
  iat: number;
  exp: number;
};

type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  systemRole: SystemRole;
  status: UserStatus;
  isEmailVerified: boolean;
  lastLoginAt: Date | null;
};

type AuthMembershipContext = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationType: OrganizationType;
  organizationRole: OrganizationRole;
};

@Injectable()
export class AuthService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenTtlSeconds: number;
  private readonly refreshTokenTtlSeconds: number;
  private readonly emailVerificationSecret: string;
  private readonly emailVerificationTtlSeconds: number;
  private readonly emailVerificationBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailIntegrationService: EmailIntegrationService,
  ) {
    this.accessTokenSecret = this.configService.get<string>(
      'JWT_ACCESS_SECRET',
      'dev_access_secret_change_me_please',
    );
    this.refreshTokenSecret = this.configService.get<string>(
      'JWT_REFRESH_SECRET',
      'dev_refresh_secret_change_me_please',
    );
    this.accessTokenTtlSeconds = this.configService.get<number>(
      'JWT_ACCESS_TTL_SECONDS',
      900,
    );
    this.refreshTokenTtlSeconds = this.configService.get<number>(
      'JWT_REFRESH_TTL_SECONDS',
      2592000,
    );
    this.emailVerificationSecret = this.configService.get<string>(
      'JWT_EMAIL_VERIFICATION_SECRET',
      this.accessTokenSecret,
    );
    this.emailVerificationTtlSeconds = this.configService.get<number>(
      'JWT_EMAIL_VERIFICATION_TTL_SECONDS',
      86400,
    );

    const configuredVerificationBaseUrl = this.configService.get<string>(
      'EMAIL_VERIFICATION_URL',
    );
    const appUrl = this.configService.get<string>(
      'APP_URL',
      'http://localhost:3000',
    );
    this.emailVerificationBaseUrl = this.normalizeVerificationBaseUrl(
      configuredVerificationBaseUrl ?? `${appUrl}/api/v1/auth/verify-email`,
    );
  }

  async register(payload: RegisterDto) {
    const email = this.normalizeEmail(payload.email);
    const fullName = payload.fullName.trim();
    const organizationType = this.resolveOrganizationType(payload.role);
    const organizationRole = this.resolveOrganizationRole(payload.role);
    const organizationName = this.resolveOrganizationName(
      payload.organizationName,
      fullName,
      payload.role,
    );

    if (fullName.length < 2) {
      throw new BadRequestException(
        'Full name must contain at least 2 visible characters',
      );
    }

    const passwordHash = await this.hashPassword(payload.password);

    try {
      const registrationResult = await this.prisma.$transaction(
        async (transactionClient) => {
          const now = new Date();
          const user = await transactionClient.user.create({
            data: {
              email,
              fullName,
              passwordHash,
              lastLoginAt: now,
            },
            select: {
              id: true,
              email: true,
              fullName: true,
              systemRole: true,
              status: true,
              isEmailVerified: true,
              lastLoginAt: true,
            },
          });

          const organization = await this.createOrganizationForUser(
            transactionClient,
            {
              email,
              organizationName,
              organizationType,
            },
          );
          await transactionClient.organizationMember.create({
            data: {
              organizationId: organization.id,
              userId: user.id,
              role: organizationRole,
            },
          });

          const context: AuthMembershipContext = {
            organizationId: organization.id,
            organizationName: organization.name,
            organizationSlug: organization.slug,
            organizationType: organization.type,
            organizationRole,
          };

          const authResponse = await this.createSessionAndBuildResponse(
            transactionClient,
            user,
            context,
          );

          return {
            authResponse,
            verificationEmailPayload: {
              userId: user.id,
              toEmail: user.email,
              fullName: user.fullName,
              organizationId: organization.id,
            },
          };
        },
      );

      await this.sendVerificationEmailBestEffort(
        registrationResult.verificationEmailPayload,
      );

      return registrationResult.authResponse;
    } catch (error) {
      if (this.isEmailUniqueConstraintError(error)) {
        throw new ConflictException('User with this email already exists');
      }

      throw error;
    }
  }

  async verifyEmail(payload: VerifyEmailDto) {
    const tokenPayload = this.verifySignedJwt<EmailVerificationJwtPayload>(
      payload.token,
      this.emailVerificationSecret,
    );

    if (tokenPayload.type !== 'email_verification') {
      throw new UnauthorizedException('Invalid email verification token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: tokenPayload.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        systemRole: true,
        status: true,
        isEmailVerified: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email verification token');
    }

    if (
      this.normalizeEmail(user.email) !==
      this.normalizeEmail(tokenPayload.email)
    ) {
      throw new UnauthorizedException('Invalid email verification token');
    }

    if (!user.isEmailVerified) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { isEmailVerified: true },
      });
    }

    const verifiedUser = { ...user, isEmailVerified: true };
    return this.createSessionAndBuildResponse(this.prisma, verifiedUser);
  }

  async login(payload: LoginDto) {
    const email = this.normalizeEmail(payload.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        isEmailVerified: true,
        lastLoginAt: true,
        passwordHash: true,
      },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await this.verifyPassword(
      payload.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Your account is not active');
    }

    const now = new Date();
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now },
      select: {
        id: true,
        email: true,
        fullName: true,
        systemRole: true,
        status: true,
        isEmailVerified: true,
        lastLoginAt: true,
      },
    });

    return this.createSessionAndBuildResponse(this.prisma, updatedUser);
  }

  async refresh(payload: RefreshTokenDto) {
    const tokenParts = this.parseRefreshToken(payload.refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { id: tokenParts.sessionId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            systemRole: true,
            status: true,
            isEmailVerified: true,
            lastLoginAt: true,
          },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token is expired or invalid');
    }

    const incomingRefreshHash = this.hashRefreshToken(payload.refreshToken);
    if (!this.safeStringEquals(incomingRefreshHash, session.refreshTokenHash)) {
      throw new UnauthorizedException('Refresh token is expired or invalid');
    }

    if (session.user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Your account is not active');
    }

    const now = new Date();
    const nextRefreshExpiresAt = new Date(
      now.getTime() + this.refreshTokenTtlSeconds * 1000,
    );
    const nextRefreshToken = this.generateRefreshToken(session.id);
    const nextRefreshTokenHash = this.hashRefreshToken(nextRefreshToken);

    await this.prisma.authSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: nextRefreshTokenHash,
        expiresAt: nextRefreshExpiresAt,
      },
    });

    const activeMembership = await this.findPrimaryMembershipByUserId(
      this.prisma,
      session.user.id,
    );
    const accessToken = this.createAccessToken(
      session.user.id,
      session.user.email,
      now,
      activeMembership,
      session.user.systemRole,
      session.user.isEmailVerified,
    );

    return this.buildAuthResponse({
      user: session.user,
      accessToken: accessToken.value,
      accessTokenExpiresAt: accessToken.expiresAt,
      refreshToken: nextRefreshToken,
      refreshTokenExpiresAt: nextRefreshExpiresAt,
      context: activeMembership,
    });
  }

  async logout(payload: RefreshTokenDto) {
    const tokenParts = this.tryParseRefreshToken(payload.refreshToken);
    if (!tokenParts) {
      return { message: 'Logged out' };
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: tokenParts.sessionId },
      select: {
        id: true,
        refreshTokenHash: true,
        revokedAt: true,
      },
    });

    if (!session || session.revokedAt) {
      return { message: 'Logged out' };
    }

    const incomingRefreshHash = this.hashRefreshToken(payload.refreshToken);
    if (!this.safeStringEquals(incomingRefreshHash, session.refreshTokenHash)) {
      return { message: 'Logged out' };
    }

    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return { message: 'Logged out' };
  }

  verifyAccessToken(token: string): JwtPayload {
    const payload = this.verifySignedJwt<JwtPayload>(
      token,
      this.accessTokenSecret,
    );

    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid access token');
    }

    return payload;
  }

  private async createSessionAndBuildResponse(
    transactionClient: Prisma.TransactionClient | PrismaService,
    user: AuthUser,
    context?: AuthMembershipContext | null,
  ) {
    const now = new Date();
    const refreshTokenExpiresAt = new Date(
      now.getTime() + this.refreshTokenTtlSeconds * 1000,
    );
    const sessionId = randomUUID();
    const refreshToken = this.generateRefreshToken(sessionId);
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const activeMembership =
      context ??
      (await this.findPrimaryMembershipByUserId(transactionClient, user.id));

    await transactionClient.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash,
        expiresAt: refreshTokenExpiresAt,
      },
    });

    const accessToken = this.createAccessToken(
      user.id,
      user.email,
      now,
      activeMembership,
      user.systemRole,
      user.isEmailVerified,
    );

    return this.buildAuthResponse({
      user,
      accessToken: accessToken.value,
      accessTokenExpiresAt: accessToken.expiresAt,
      refreshToken,
      refreshTokenExpiresAt,
      context: activeMembership,
    });
  }

  private buildAuthResponse(payload: {
    user: AuthUser;
    accessToken: string;
    accessTokenExpiresAt: Date;
    refreshToken: string;
    refreshTokenExpiresAt: Date;
    context: AuthMembershipContext | null;
  }) {
    return {
      user: {
        id: payload.user.id,
        email: payload.user.email,
        fullName: payload.user.fullName,
        systemRole: payload.user.systemRole,
        status: payload.user.status,
        isEmailVerified: payload.user.isEmailVerified,
        lastLoginAt: payload.user.lastLoginAt?.toISOString() ?? null,
      },
      tokens: {
        tokenType: 'Bearer',
        accessToken: payload.accessToken,
        accessTokenExpiresAt: payload.accessTokenExpiresAt.toISOString(),
        refreshToken: payload.refreshToken,
        refreshTokenExpiresAt: payload.refreshTokenExpiresAt.toISOString(),
      },
      context: payload.context,
    };
  }

  private createAccessToken(
    userId: string,
    email: string,
    issuedAt: Date,
    context: AuthMembershipContext | null,
    systemRole: SystemRole = SystemRole.USER,
    isEmailVerified: boolean = false,
  ): { value: string; expiresAt: Date } {
    const iat = Math.floor(issuedAt.getTime() / 1000);
    const exp = iat + this.accessTokenTtlSeconds;
    const payload: JwtPayload = {
      sub: userId,
      email,
      systemRole,
      isEmailVerified,
      organizationId: context?.organizationId,
      organizationRole: context?.organizationRole,
      organizationType: context?.organizationType,
      type: 'access',
      iat,
      exp,
    };

    return {
      value: this.signJwt(payload, this.accessTokenSecret),
      expiresAt: new Date(exp * 1000),
    };
  }

  private signJwt(
    payload: JwtPayload | EmailVerificationJwtPayload,
    secret: string,
  ): string {
    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };
    const encodedHeader = this.encodeToBase64Url(JSON.stringify(header));
    const encodedPayload = this.encodeToBase64Url(JSON.stringify(payload));
    const signature = createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  private createEmailVerificationToken(
    userId: string,
    email: string,
    issuedAt: Date,
  ): { token: string; expiresAt: Date } {
    const iat = Math.floor(issuedAt.getTime() / 1000);
    const exp = iat + this.emailVerificationTtlSeconds;
    const payload: EmailVerificationJwtPayload = {
      sub: userId,
      email,
      type: 'email_verification',
      iat,
      exp,
    };

    return {
      token: this.signJwt(payload, this.emailVerificationSecret),
      expiresAt: new Date(exp * 1000),
    };
  }

  private async sendVerificationEmailBestEffort(payload: {
    userId: string;
    toEmail: string;
    fullName: string;
    organizationId: string;
  }): Promise<void> {
    const issuedAt = new Date();
    const verificationToken = this.createEmailVerificationToken(
      payload.userId,
      payload.toEmail,
      issuedAt,
    );
    const verificationUrl = this.buildEmailVerificationUrl(
      verificationToken.token,
    );
    const expiresAtIso = verificationToken.expiresAt.toISOString();
    const subject = 'Verify your email to activate Bolder Scope';
    const text = [
      `Hi ${payload.fullName},`,
      '',
      'Thanks for registering on Bolder Scope.',
      `Please verify your email by opening this link: ${verificationUrl}`,
      '',
      `This link expires at ${expiresAtIso}.`,
      'If you did not create this account, you can ignore this email.',
    ].join('\n');
    const html = [
      `<p>Hi ${this.escapeHtml(payload.fullName)},</p>`,
      '<p>Thanks for registering on Bolder Scope.</p>',
      `<p>Please verify your email by clicking <a href="${verificationUrl}">this verification link</a>.</p>`,
      `<p>This link expires at <strong>${expiresAtIso}</strong>.</p>`,
      '<p>If you did not create this account, you can ignore this email.</p>',
    ].join('');

    await this.emailIntegrationService.sendBestEffort({
      toEmail: payload.toEmail,
      templateKey: 'AUTH_EMAIL_VERIFICATION',
      subject,
      text,
      html,
      organizationId: payload.organizationId,
      userId: payload.userId,
      payload: {
        fullName: payload.fullName,
        verificationUrl,
        expiresAt: expiresAtIso,
      },
    });
  }

  private buildEmailVerificationUrl(token: string): string {
    const verificationUrl = new URL(this.emailVerificationBaseUrl);
    verificationUrl.searchParams.set('token', token);
    return verificationUrl.toString();
  }

  private verifySignedJwt<T extends { exp: number; iat: number }>(
    token: string,
    secret: string,
  ): T {
    const [encodedHeader, encodedPayload, receivedSignature, ...rest] = token
      .trim()
      .split('.');
    if (
      !encodedHeader ||
      !encodedPayload ||
      !receivedSignature ||
      rest.length > 0
    ) {
      throw new UnauthorizedException('Invalid email verification token');
    }

    const computedSignature = createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    if (!this.safeStringEquals(computedSignature, receivedSignature)) {
      throw new UnauthorizedException('Invalid email verification token');
    }

    let header: { alg?: string; typ?: string };
    let payload: T;

    try {
      header = JSON.parse(this.decodeBase64Url(encodedHeader)) as {
        alg?: string;
        typ?: string;
      };
      payload = JSON.parse(this.decodeBase64Url(encodedPayload)) as T;
    } catch {
      throw new UnauthorizedException('Invalid email verification token');
    }

    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      throw new UnauthorizedException('Invalid email verification token');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(payload.exp) || payload.exp <= nowSeconds) {
      throw new UnauthorizedException('Email verification token is expired');
    }

    if (!Number.isInteger(payload.iat) || payload.iat > nowSeconds + 60) {
      throw new UnauthorizedException('Invalid email verification token');
    }

    return payload;
  }

  private encodeToBase64Url(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  }

  private decodeBase64Url(value: string): string {
    return Buffer.from(value, 'base64url').toString('utf8');
  }

  private resolveOrganizationType(role: AuthAccountRole): OrganizationType {
    return role === AuthAccountRole.CLIENT
      ? OrganizationType.CLIENT
      : OrganizationType.AGENCY;
  }

  private resolveOrganizationRole(role: AuthAccountRole): OrganizationRole {
    return role === AuthAccountRole.CLIENT
      ? OrganizationRole.CLIENT
      : OrganizationRole.OWNER;
  }

  private resolveOrganizationName(
    providedOrganizationName: string | undefined,
    fullName: string,
    role: AuthAccountRole,
  ): string {
    if (providedOrganizationName?.trim()) {
      return providedOrganizationName.trim();
    }

    return role === AuthAccountRole.CLIENT
      ? `${fullName} Client Team`
      : `${fullName} Agency`;
  }

  private async createOrganizationForUser(
    transactionClient: Prisma.TransactionClient | PrismaService,
    payload: {
      organizationName: string;
      organizationType: OrganizationType;
      email: string;
    },
  ) {
    const baseSlug = this.slugify(payload.organizationName);
    const slug = await this.generateUniqueOrganizationSlug(
      transactionClient,
      baseSlug,
    );

    return transactionClient.organization.create({
      data: {
        name: payload.organizationName,
        slug,
        type: payload.organizationType,
        billingEmail: payload.email,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
      },
    });
  }

  private async generateUniqueOrganizationSlug(
    transactionClient: Prisma.TransactionClient | PrismaService,
    baseSlug: string,
  ): Promise<string> {
    const slugBase = baseSlug || `org-${randomBytes(4).toString('hex')}`;
    let counter = 0;

    while (counter < 500) {
      const suffix = counter === 0 ? '' : `-${counter + 1}`;
      const candidate = `${slugBase.slice(0, Math.max(1, 120 - suffix.length))}${suffix}`;
      const exists = await transactionClient.organization.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!exists) {
        return candidate;
      }

      counter += 1;
    }

    throw new ConflictException('Could not generate unique organization slug');
  }

  private slugify(value: string): string {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return normalized.slice(0, 120);
  }

  private normalizeVerificationBaseUrl(value: string): string {
    try {
      return new URL(value).toString();
    } catch {
      return 'http://localhost:3000/api/v1/auth/verify-email';
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private async findPrimaryMembershipByUserId(
    transactionClient: Prisma.TransactionClient | PrismaService,
    userId: string,
  ): Promise<AuthMembershipContext | null> {
    const membership = await transactionClient.organizationMember.findFirst({
      where: { userId },
      orderBy: [{ joinedAt: 'asc' }],
      select: {
        role: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
          },
        },
      },
    });

    if (!membership) {
      return null;
    }

    return {
      organizationId: membership.organization.id,
      organizationName: membership.organization.name,
      organizationSlug: membership.organization.slug,
      organizationType: membership.organization.type,
      organizationRole: membership.role,
    };
  }

  private generateRefreshToken(sessionId: string): string {
    const tokenSecret = randomBytes(48).toString('base64url');
    return `${sessionId}.${tokenSecret}`;
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHmac('sha256', this.refreshTokenSecret)
      .update(refreshToken)
      .digest('hex');
  }

  private parseRefreshToken(refreshToken: string): { sessionId: string } {
    const tokenParts = this.tryParseRefreshToken(refreshToken);
    if (!tokenParts) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return tokenParts;
  }

  private tryParseRefreshToken(
    refreshToken: string,
  ): { sessionId: string } | null {
    const [sessionId, tokenSecret, ...rest] = refreshToken.trim().split('.');

    if (!sessionId || !tokenSecret || rest.length > 0) {
      return null;
    }

    if (!UUID_V4_REGEX.test(sessionId)) {
      return null;
    }

    if (tokenSecret.length < 32) {
      return null;
    }

    return { sessionId };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scryptAsync(
      password,
      salt,
      PASSWORD_HASH_KEY_LENGTH,
    )) as Buffer;

    return `scrypt$${salt}$${derivedKey.toString('hex')}`;
  }

  private async verifyPassword(
    password: string,
    passwordHash: string,
  ): Promise<boolean> {
    const [algorithm, salt, storedHashHex] = passwordHash.split('$');
    if (algorithm !== 'scrypt' || !salt || !storedHashHex) {
      return false;
    }

    const storedHash = Buffer.from(storedHashHex, 'hex');
    const derivedKey = (await scryptAsync(
      password,
      salt,
      PASSWORD_HASH_KEY_LENGTH,
    )) as Buffer;

    if (storedHash.length !== derivedKey.length) {
      return false;
    }

    return timingSafeEqual(storedHash, derivedKey);
  }

  private safeStringEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private isEmailUniqueConstraintError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    if (error.code !== 'P2002') {
      return false;
    }

    const target = error.meta?.target;
    if (Array.isArray(target)) {
      return target.includes('email');
    }

    if (typeof target === 'string') {
      return target.includes('email');
    }

    return false;
  }
}
