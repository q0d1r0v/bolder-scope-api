import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { OrganizationRole } from '@prisma/client';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUserShape } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { AcceptInviteDto } from '@/modules/organizations/dto/accept-invite.dto';
import { CreateOrganizationDto } from '@/modules/organizations/dto/create-organization.dto';
import { InviteMemberDto } from '@/modules/organizations/dto/invite-member.dto';
import { OrganizationsService } from '@/modules/organizations/services/organizations.service';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new organization' })
  @ApiCreatedResponse({ description: 'Organization created successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiConflictResponse({ description: 'Organization with this slug already exists' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  create(@Body() payload: CreateOrganizationDto, @CurrentUser() user: CurrentUserShape) {
    return this.organizationsService.create(payload, user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List organizations the current user belongs to' })
  @ApiOkResponse({ description: 'Paginated list of organizations' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  findAll(@Query() query: PaginationQueryDto, @CurrentUser() user: CurrentUserShape) {
    return this.organizationsService.findAll(user.userId, query);
  }

  @Get(':organizationId')
  @ApiOperation({ summary: 'Get organization details' })
  @ApiOkResponse({ description: 'Organization details' })
  @ApiNotFoundResponse({ description: 'Organization not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  findOne(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.organizationsService.findOne(organizationId, user.userId);
  }

  @Get(':organizationId/members')
  @ApiOperation({ summary: 'List members of an organization' })
  @ApiOkResponse({ description: 'Paginated list of organization members' })
  @ApiForbiddenResponse({ description: 'Not a member of this organization' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  getMembers(
    @Param('organizationId') organizationId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.organizationsService.getMembers(organizationId, user.userId, query);
  }

  @Post(':organizationId/invite')
  @Roles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({ summary: 'Invite a developer or client to the organization' })
  @ApiCreatedResponse({ description: 'Invitation sent successfully' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiConflictResponse({ description: 'User is already a member or invite is pending' })
  @ApiForbiddenResponse({ description: 'Insufficient role (requires OWNER or ADMIN)' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  inviteMember(
    @Param('organizationId') organizationId: string,
    @Body() payload: InviteMemberDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.organizationsService.inviteMember(organizationId, user.userId, payload);
  }

  @Public()
  @Post('accept-invite')
  @ApiOperation({ summary: 'Accept an organization invite (public — no auth required)' })
  @ApiOkResponse({ description: 'Invitation accepted successfully' })
  @ApiBadRequestResponse({ description: 'Invalid or expired invite token' })
  acceptInvite(@Body() payload: AcceptInviteDto) {
    return this.organizationsService.acceptInvite(payload);
  }

  @Delete(':organizationId/invites/:memberId')
  @Roles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  @ApiOkResponse({ description: 'Invitation revoked successfully' })
  @ApiNotFoundResponse({ description: 'Pending invite not found' })
  @ApiForbiddenResponse({ description: 'Insufficient role (requires OWNER or ADMIN)' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  revokeInvite(
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.organizationsService.revokeInvite(organizationId, memberId, user.userId);
  }
}
