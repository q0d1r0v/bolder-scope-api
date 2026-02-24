import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { SystemRoles } from '@/common/decorators/system-roles.decorator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import {
  AdminOrganizationsQueryDto,
  AdminUpdateOrganizationDto,
} from '@/modules/admin/dto/admin-organizations.dto';
import { AdminOrganizationsService } from '@/modules/admin/services/admin-organizations.service';

@ApiTags('Admin - Organizations')
@ApiBearerAuth('bearer')
@SystemRoles(SystemRole.SUPER_ADMIN)
@Controller('admin/organizations')
export class AdminOrganizationsController {
  constructor(
    private readonly adminOrganizationsService: AdminOrganizationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all organizations (admin)' })
  @ApiOkResponse({ description: 'Paginated list of all organizations' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  findAll(@Query() query: AdminOrganizationsQueryDto) {
    return this.adminOrganizationsService.findAll(query);
  }

  @Get(':organizationId')
  @ApiOperation({ summary: 'Get organization details (admin)' })
  @ApiOkResponse({ description: 'Organization details with subscription info' })
  @ApiNotFoundResponse({ description: 'Organization not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  findOne(@Param('organizationId') organizationId: string) {
    return this.adminOrganizationsService.findOne(organizationId);
  }

  @Patch(':organizationId')
  @ApiOperation({ summary: 'Update organization status (admin)' })
  @ApiOkResponse({ description: 'Organization updated successfully' })
  @ApiNotFoundResponse({ description: 'Organization not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  update(
    @Param('organizationId') organizationId: string,
    @Body() payload: AdminUpdateOrganizationDto,
  ) {
    return this.adminOrganizationsService.update(organizationId, payload);
  }

  @Get(':organizationId/members')
  @ApiOperation({ summary: 'List organization members (admin)' })
  @ApiOkResponse({ description: 'Paginated list of organization members' })
  @ApiNotFoundResponse({ description: 'Organization not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  getMembers(
    @Param('organizationId') organizationId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.adminOrganizationsService.getMembers(organizationId, query);
  }

  @Get(':organizationId/projects')
  @ApiOperation({ summary: 'List organization projects (admin)' })
  @ApiOkResponse({ description: 'Paginated list of organization projects' })
  @ApiNotFoundResponse({ description: 'Organization not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  getProjects(
    @Param('organizationId') organizationId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.adminOrganizationsService.getProjects(organizationId, query);
  }
}
