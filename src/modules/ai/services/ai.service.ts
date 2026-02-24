import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AiProvider, AiRunStatus, AiTaskType } from '@prisma/client';
import type { CurrentUserShape } from '@/common/decorators/current-user.decorator';
import type { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import {
  buildPrismaPagination,
  paginate,
} from '@/common/helpers/pagination.helper';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateAiRunDto } from '@/modules/ai/dto/create-ai-run.dto';

export type StructuredRequirement = {
  projectOverview: string;
  objectives: string[];
  functionalRequirements: Array<{
    category: string;
    requirements: string[];
  }>;
  nonFunctionalRequirements: string[];
  assumptions: string[];
  constraints: string[];
};

export type ExtractedFeature = {
  title: string;
  description: string;
  priority: 'MUST' | 'SHOULD' | 'COULD' | 'WONT';
  complexity: 'XS' | 'S' | 'M' | 'L' | 'XL';
};

export type TimelineCostEstimate = {
  timelineMinDays: number;
  timelineMaxDays: number;
  costMin: number;
  costMax: number;
  confidenceScore: number;
  assumptions: string;
  lineItems: Array<{
    name: string;
    description: string;
    hoursMin: number;
    hoursMax: number;
    costMin: number;
    costMax: number;
  }>;
};

export type TechStackResult = {
  frontend: string[];
  backend: string[];
  database: string[];
  infrastructure: string[];
  integrations: string[];
  rationale: Record<string, string>;
};

export type UserFlowScreenResult = {
  name: string;
  description: string;
  screenType: string;
  purpose: string;
  userActions: string[];
  entryPoint: boolean;
  featureTitle?: string;
};

export type UserFlowTransitionResult = {
  fromScreen: string;
  toScreen: string;
  triggerAction: string;
  triggerLabel: string;
  condition?: string;
};

export type UserFlowResult = {
  screens: UserFlowScreenResult[];
  transitions: UserFlowTransitionResult[];
  assumptions: string;
};

export type WireframeComponent = {
  type: string;
  label?: string;
  props?: Record<string, unknown>;
  children?: WireframeComponent[];
};

export type WireframeSection = {
  name: string;
  layout: string;
  components: WireframeComponent[];
};

export type WireframeScreenData = {
  screenName: string;
  title: string;
  description: string;
  sections: WireframeSection[];
};

export type WireframeDesignSystem = {
  colorPalette: Record<string, string>;
  typography: Record<string, string>;
  spacing: Record<string, string>;
};

export type WireframeResult = {
  screens: WireframeScreenData[];
  designSystem: WireframeDesignSystem;
  assumptions: string;
};

export type CodeGenFileResult = {
  filePath: string;
  fileName: string;
  fileType:
    | 'PAGE'
    | 'COMPONENT'
    | 'API_ROUTE'
    | 'SERVICE'
    | 'SCHEMA'
    | 'CONFIG'
    | 'STYLE'
    | 'UTIL'
    | 'TYPE';
  language: string;
  content: string;
  description: string;
};

export type CodeGenResult = {
  files: CodeGenFileResult[];
  projectStructure: Record<string, unknown>;
  assumptions: string;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic | null;
  private readonly model: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('CLAUDE_API_KEY');
    this.model = this.configService.get<string>(
      'AI_MODEL',
      'claude-sonnet-4-20250514',
    );
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  async createRun(payload: CreateAiRunDto, user: CurrentUserShape) {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'AI service is not configured. Set CLAUDE_API_KEY.',
      );
    }

    const aiRun = await this.prisma.aiRun.create({
      data: {
        organizationId: user.organizationId ?? null,
        projectId: payload.projectId ?? null,
        requirementSnapshotId: payload.requirementSnapshotId ?? null,
        estimateSnapshotId: payload.estimateSnapshotId ?? null,
        initiatedById: user.userId,
        provider: AiProvider.CLAUDE,
        model: this.model,
        taskType: payload.taskType as AiTaskType,
        status: AiRunStatus.QUEUED,
      },
      select: {
        id: true,
        provider: true,
        model: true,
        taskType: true,
        status: true,
        createdAt: true,
      },
    });

    return aiRun;
  }

  async listRuns(
    query: PaginationQueryDto,
    user: CurrentUserShape,
    projectId?: string,
  ) {
    const { skip, take } = buildPrismaPagination(query);

    const where: Record<string, unknown> = {};
    if (projectId) {
      where.projectId = projectId;
    }
    if (user.organizationId) {
      where.organizationId = user.organizationId;
    }

    const [runs, total] = await Promise.all([
      this.prisma.aiRun.findMany({
        where,
        select: {
          id: true,
          provider: true,
          model: true,
          taskType: true,
          status: true,
          inputTokens: true,
          outputTokens: true,
          totalCostUsd: true,
          latencyMs: true,
          errorMessage: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.aiRun.count({ where }),
    ]);

    return paginate(runs, total, query);
  }

  async structureRequirements(
    inputs: string[],
    instruction?: string,
    context?: { organizationId?: string; projectId?: string; userId: string },
  ): Promise<{ result: StructuredRequirement; aiRunId: string }> {
    this.ensureConfigured();

    const aiRun = await this.prisma.aiRun.create({
      data: {
        organizationId: context?.organizationId ?? null,
        projectId: context?.projectId ?? null,
        initiatedById: context?.userId ?? null,
        provider: AiProvider.CLAUDE,
        model: this.model,
        taskType: AiTaskType.REQUIREMENT_STRUCTURING,
        status: AiRunStatus.QUEUED,
        requestPayload: { inputs, instruction } as object,
      },
    });

    const systemPrompt = `You are an expert software requirements analyst. Your job is to convert raw project descriptions into well-structured requirement documents.

Always respond with valid JSON matching this exact schema:
{
  "projectOverview": "string - brief summary of the project",
  "objectives": ["string - key project objectives"],
  "functionalRequirements": [
    {
      "category": "string - requirement category name",
      "requirements": ["string - specific requirements"]
    }
  ],
  "nonFunctionalRequirements": ["string - performance, security, scalability requirements"],
  "assumptions": ["string - assumptions made"],
  "constraints": ["string - known constraints"]
}

Do NOT include any text outside the JSON object.`;

    const userMessage = instruction
      ? `Project inputs:\n${inputs.join('\n\n---\n\n')}\n\nAdditional instruction: ${instruction}`
      : `Project inputs:\n${inputs.join('\n\n---\n\n')}`;

    const result = await this.callClaude<StructuredRequirement>(
      aiRun.id,
      systemPrompt,
      userMessage,
    );

    return { result, aiRunId: aiRun.id };
  }

  async extractFeatures(
    structuredJson: Record<string, unknown>,
    context?: { organizationId?: string; projectId?: string; userId: string },
  ): Promise<{ result: ExtractedFeature[]; aiRunId: string }> {
    this.ensureConfigured();

    const aiRun = await this.prisma.aiRun.create({
      data: {
        organizationId: context?.organizationId ?? null,
        projectId: context?.projectId ?? null,
        initiatedById: context?.userId ?? null,
        provider: AiProvider.CLAUDE,
        model: this.model,
        taskType: AiTaskType.FEATURE_EXTRACTION,
        status: AiRunStatus.QUEUED,
        requestPayload: structuredJson as object,
      },
    });

    const systemPrompt = `You are an expert product manager who breaks requirements into discrete features.

Respond with a JSON array of features. Each feature must match this schema:
{
  "title": "string - short feature name",
  "description": "string - what this feature does",
  "priority": "MUST" | "SHOULD" | "COULD" | "WONT",
  "complexity": "XS" | "S" | "M" | "L" | "XL"
}

Priority follows MoSCoW method. Complexity: XS=hours, S=1-2 days, M=3-5 days, L=1-2 weeks, XL=2+ weeks.
Return ONLY a JSON array. No text outside the array.`;

    const result = await this.callClaude<ExtractedFeature[]>(
      aiRun.id,
      systemPrompt,
      `Structured requirements:\n${JSON.stringify(structuredJson, null, 2)}`,
    );

    return { result, aiRunId: aiRun.id };
  }

  async estimateTimelineAndCost(
    structuredJson: Record<string, unknown>,
    features: Array<{
      title: string;
      description: string;
      priority: string;
      complexity: string;
    }>,
    currency: string,
    context?: { organizationId?: string; projectId?: string; userId: string },
  ): Promise<{ result: TimelineCostEstimate; aiRunId: string }> {
    this.ensureConfigured();

    const aiRun = await this.prisma.aiRun.create({
      data: {
        organizationId: context?.organizationId ?? null,
        projectId: context?.projectId ?? null,
        initiatedById: context?.userId ?? null,
        provider: AiProvider.CLAUDE,
        model: this.model,
        taskType: AiTaskType.TIMELINE_ESTIMATION,
        status: AiRunStatus.QUEUED,
        requestPayload: { structuredJson, features, currency } as object,
      },
    });

    const systemPrompt = `You are an expert software project estimator. Provide realistic timeline and cost estimates.

Respond with valid JSON matching this schema:
{
  "timelineMinDays": number,
  "timelineMaxDays": number,
  "costMin": number (in ${currency}),
  "costMax": number (in ${currency}),
  "confidenceScore": number (0-100),
  "assumptions": "string - estimation assumptions",
  "lineItems": [
    {
      "name": "string - feature or phase name",
      "description": "string - what this covers",
      "hoursMin": number,
      "hoursMax": number,
      "costMin": number,
      "costMax": number
    }
  ]
}

Use an average developer rate of $75-150/hour for cost calculations. Be realistic, not optimistic.
Return ONLY valid JSON. No text outside the JSON object.`;

    const result = await this.callClaude<TimelineCostEstimate>(
      aiRun.id,
      systemPrompt,
      `Requirements:\n${JSON.stringify(structuredJson, null, 2)}\n\nFeatures:\n${JSON.stringify(features, null, 2)}`,
    );

    return { result, aiRunId: aiRun.id };
  }

  async recommendTechStack(
    structuredJson: Record<string, unknown>,
    features: Array<{
      title: string;
      description: string;
      priority: string;
      complexity: string;
    }>,
    context?: { organizationId?: string; projectId?: string; userId: string },
  ): Promise<{ result: TechStackResult; aiRunId: string }> {
    this.ensureConfigured();

    const aiRun = await this.prisma.aiRun.create({
      data: {
        organizationId: context?.organizationId ?? null,
        projectId: context?.projectId ?? null,
        initiatedById: context?.userId ?? null,
        provider: AiProvider.CLAUDE,
        model: this.model,
        taskType: AiTaskType.TECH_STACK_RECOMMENDATION,
        status: AiRunStatus.QUEUED,
        requestPayload: { structuredJson, features } as object,
      },
    });

    const systemPrompt = `You are an expert software architect who recommends technology stacks.

Respond with valid JSON matching this schema:
{
  "frontend": ["string - frontend technologies"],
  "backend": ["string - backend technologies"],
  "database": ["string - database technologies"],
  "infrastructure": ["string - hosting, CI/CD, monitoring tools"],
  "integrations": ["string - third-party services and APIs"],
  "rationale": {
    "categoryName": "string - why this choice was made"
  }
}

Recommend modern, production-ready technologies. Consider scalability, developer experience, and community support.
Return ONLY valid JSON. No text outside the JSON object.`;

    const result = await this.callClaude<TechStackResult>(
      aiRun.id,
      systemPrompt,
      `Requirements:\n${JSON.stringify(structuredJson, null, 2)}\n\nFeatures:\n${JSON.stringify(features, null, 2)}`,
    );

    return { result, aiRunId: aiRun.id };
  }

  async generateUserFlows(
    structuredJson: Record<string, unknown>,
    features: Array<{
      title: string;
      description: string;
      priority: string;
      complexity: string;
    }>,
    context?: { organizationId?: string; projectId?: string; userId: string },
  ): Promise<{ result: UserFlowResult; aiRunId: string }> {
    this.ensureConfigured();

    const aiRun = await this.prisma.aiRun.create({
      data: {
        organizationId: context?.organizationId ?? null,
        projectId: context?.projectId ?? null,
        initiatedById: context?.userId ?? null,
        provider: AiProvider.CLAUDE,
        model: this.model,
        taskType: AiTaskType.USER_FLOW_GENERATION,
        status: AiRunStatus.QUEUED,
        requestPayload: { structuredJson, features } as object,
      },
    });

    const systemPrompt = `You are an expert UX designer and information architect. Your job is to design user flows from software requirements and features.

A user flow describes the screens in an application and the transitions between them. Each screen represents a distinct page or view that the user interacts with.

Respond with valid JSON matching this exact schema:
{
  "screens": [
    {
      "name": "string - PascalCase screen name (e.g., 'LoginScreen', 'Dashboard', 'UserProfile')",
      "description": "string - what this screen shows and its role in the application",
      "screenType": "string - one of: landing, auth, dashboard, list, detail, form, settings, search, checkout, error, empty, modal",
      "purpose": "string - the user's goal when viewing this screen",
      "userActions": ["string - actions the user can take (e.g., 'click_login_button', 'fill_email_field', 'select_item')"],
      "entryPoint": boolean,
      "featureTitle": "string - optional, matching feature title this screen primarily serves"
    }
  ],
  "transitions": [
    {
      "fromScreen": "string - name of the source screen",
      "toScreen": "string - name of the destination screen",
      "triggerAction": "string - the action that causes this transition (must match a userAction from fromScreen)",
      "triggerLabel": "string - human-readable label for the transition (e.g., 'Sign Up', 'View Details')",
      "condition": "string or null - optional guard condition"
    }
  ],
  "assumptions": "string - any assumptions made about the user flow design"
}

Design rules:
- Every application must have at least one entry point screen (entryPoint: true)
- Every screen must be reachable via at least one transition (except entry points)
- Transitions must reference valid screen names from the screens array
- Include authentication flows (login, register) if the app has user accounts
- Include navigation patterns (back, home, breadcrumbs) where appropriate
- Keep screen count reasonable: 8-20 screens for most applications
- Map screens to features where possible using featureTitle

Return ONLY valid JSON. No text outside the JSON object.`;

    const result = await this.callClaude<UserFlowResult>(
      aiRun.id,
      systemPrompt,
      `Requirements:\n${JSON.stringify(structuredJson, null, 2)}\n\nFeatures:\n${JSON.stringify(features, null, 2)}`,
    );

    return { result, aiRunId: aiRun.id };
  }

  async generateWireframes(
    structuredJson: Record<string, unknown>,
    features: Array<{
      title: string;
      description: string;
      priority: string;
      complexity: string;
    }>,
    userFlowScreens: Array<{
      name: string;
      description: string;
      screenType: string;
      purpose: string;
      userActions: string[];
    }>,
    context?: { organizationId?: string; projectId?: string; userId: string },
  ): Promise<{ result: WireframeResult; aiRunId: string }> {
    this.ensureConfigured();

    const aiRun = await this.prisma.aiRun.create({
      data: {
        organizationId: context?.organizationId ?? null,
        projectId: context?.projectId ?? null,
        initiatedById: context?.userId ?? null,
        provider: AiProvider.CLAUDE,
        model: this.model,
        taskType: AiTaskType.WIREFRAME_GENERATION,
        status: AiRunStatus.QUEUED,
        requestPayload: { structuredJson, features, userFlowScreens } as object,
      },
    });

    const systemPrompt = `You are an expert UI/UX designer who creates wireframe layouts for web and mobile applications.

Given requirements, features, and user flow screens, produce a structured wireframe definition for each screen. Each wireframe defines the visual layout using a component tree.

Respond with valid JSON matching this exact schema:
{
  "screens": [
    {
      "screenName": "string - must match a screen name from the provided user flow",
      "title": "string - display title for the screen",
      "description": "string - brief description of the wireframe layout",
      "sections": [
        {
          "name": "string - section name (e.g., 'header', 'hero', 'mainContent', 'sidebar', 'footer')",
          "layout": "row" | "column" | "grid" | "stack",
          "components": [
            {
              "type": "string - one of: header, nav, breadcrumb, button, link, input, textarea, select, checkbox, radio, toggle, form, card, list, table, image, icon, text, heading, divider, avatar, badge, tab, accordion, modal, sidebar, chart, map, fileUpload, searchBar, pagination, notification, progressBar, skeleton",
              "label": "string - display text or placeholder",
              "props": {
                "variant": "string - optional style variant (primary, secondary, outline, ghost)",
                "size": "string - optional (sm, md, lg)",
                "placeholder": "string - optional for inputs",
                "required": boolean,
                "columns": number,
                "items": ["string - for lists/selects"]
              },
              "children": []
            }
          ]
        }
      ]
    }
  ],
  "designSystem": {
    "colorPalette": {
      "primary": "string - hex color",
      "secondary": "string - hex color",
      "background": "string - hex color",
      "surface": "string - hex color",
      "text": "string - hex color",
      "textSecondary": "string - hex color",
      "border": "string - hex color",
      "error": "string - hex color",
      "success": "string - hex color",
      "warning": "string - hex color"
    },
    "typography": {
      "fontFamily": "string",
      "headingSize": "string",
      "bodySize": "string"
    },
    "spacing": {
      "unit": "string - e.g., '8px'",
      "sectionGap": "string",
      "componentGap": "string"
    }
  },
  "assumptions": "string - design assumptions"
}

Design rules:
- Create a wireframe for EVERY screen in the user flow
- Use semantic section names (header, navigation, mainContent, sidebar, footer)
- Include navigation elements that match the user flow transitions
- Forms should have all necessary input fields
- Lists/tables should show realistic column/field names
- Include empty states and loading indicators where appropriate
- Design for desktop-first but keep responsive considerations in mind
- Keep the component tree depth reasonable (max 4 levels deep)

Return ONLY valid JSON. No text outside the JSON object.`;

    const result = await this.callClaude<WireframeResult>(
      aiRun.id,
      systemPrompt,
      `Requirements:\n${JSON.stringify(structuredJson, null, 2)}\n\nFeatures:\n${JSON.stringify(features, null, 2)}\n\nUser Flow Screens:\n${JSON.stringify(userFlowScreens, null, 2)}`,
      8192,
    );

    return { result, aiRunId: aiRun.id };
  }

  async generateCode(
    structuredJson: Record<string, unknown>,
    features: Array<{
      title: string;
      description: string;
      priority: string;
      complexity: string;
    }>,
    techStack: {
      frontend: string[];
      backend: string[];
      database: string[];
      infrastructure: string[];
    },
    wireframeScreens: Array<{
      name: string;
      description: string;
      layoutJson: unknown;
    }>,
    stack: string,
    context?: { organizationId?: string; projectId?: string; userId: string },
  ): Promise<{ result: CodeGenResult; aiRunId: string }> {
    this.ensureConfigured();

    const aiRun = await this.prisma.aiRun.create({
      data: {
        organizationId: context?.organizationId ?? null,
        projectId: context?.projectId ?? null,
        initiatedById: context?.userId ?? null,
        provider: AiProvider.CLAUDE,
        model: this.model,
        taskType: AiTaskType.CODE_GENERATION,
        status: AiRunStatus.QUEUED,
        requestPayload: {
          structuredJson,
          features,
          techStack,
          wireframeScreens: wireframeScreens.map((s) => s.name),
          stack,
        } as object,
      },
    });

    const stackMap: Record<string, { frontend: string; backend: string }> = {
      NEXTJS_NESTJS: { frontend: 'Next.js (App Router)', backend: 'NestJS' },
      NEXTJS_EXPRESS: { frontend: 'Next.js (App Router)', backend: 'Express.js' },
      REACT_NESTJS: { frontend: 'React (Vite)', backend: 'NestJS' },
      REACT_EXPRESS: { frontend: 'React (Vite)', backend: 'Express.js' },
    };

    const selectedStack = stackMap[stack] ?? stackMap['NEXTJS_NESTJS'];

    const systemPrompt = `You are an expert full-stack developer who generates production-ready project scaffolding code.

Given requirements, features, tech stack, and wireframe screens, generate a complete project structure with actual working code files.

Target Stack:
- Frontend: ${selectedStack.frontend} with TypeScript and Tailwind CSS
- Backend: ${selectedStack.backend} with TypeScript and Prisma ORM
- Database: PostgreSQL

Respond with valid JSON matching this exact schema:
{
  "files": [
    {
      "filePath": "string - full relative path from project root (e.g., 'frontend/src/app/page.tsx')",
      "fileName": "string - just the file name (e.g., 'page.tsx')",
      "fileType": "PAGE | COMPONENT | API_ROUTE | SERVICE | SCHEMA | CONFIG | STYLE | UTIL | TYPE",
      "language": "string - typescript, css, json, prisma, markdown",
      "content": "string - the COMPLETE file content with proper imports, types, and logic",
      "description": "string - what this file does"
    }
  ],
  "projectStructure": {
    "frontend": { "directories": ["src/app", "src/components", "src/lib", "src/types"] },
    "backend": { "directories": ["src/modules", "src/common", "prisma"] }
  },
  "assumptions": "string - assumptions made during code generation"
}

File generation rules:
1. FRONTEND files to generate:
   - One page/route file for EACH wireframe screen
   - Reusable UI components (Navbar, Sidebar, Card, Table, Form, Button, Input, Modal)
   - Layout file with navigation
   - TypeScript types/interfaces for all data models
   - API client utility for backend calls
   - Tailwind config and global styles
   - package.json with all dependencies
   - tsconfig.json

2. BACKEND files to generate:
   - Prisma schema based on the requirements and features
   - One module (controller + service) per major feature group
   - DTOs with class-validator decorators
   - Auth module stub (JWT-based)
   - Main app entry point
   - package.json with all dependencies
   - tsconfig.json

3. Code quality rules:
   - Use TypeScript strict mode
   - Include proper imports in every file
   - Use Tailwind CSS classes for all styling
   - Add proper TypeScript types (no 'any')
   - Make components functional with React hooks
   - Include form validation where needed
   - Add loading and error states to pages
   - Use responsive design (mobile-first)

4. Each wireframe screen MUST have a corresponding frontend page file
5. Generate 20-40 files total for a complete scaffold
6. File content must be COMPLETE and runnable - no placeholders or TODOs

Return ONLY valid JSON. No text outside the JSON object.`;

    const result = await this.callClaude<CodeGenResult>(
      aiRun.id,
      systemPrompt,
      `Requirements:\n${JSON.stringify(structuredJson, null, 2)}\n\nFeatures:\n${JSON.stringify(features, null, 2)}\n\nTech Stack:\n${JSON.stringify(techStack, null, 2)}\n\nWireframe Screens:\n${JSON.stringify(wireframeScreens, null, 2)}`,
      16384,
    );

    return { result, aiRunId: aiRun.id };
  }

  private async callClaude<T>(
    aiRunId: string,
    systemPrompt: string,
    userMessage: string,
    maxTokens = 4096,
  ): Promise<T> {
    const startTime = Date.now();

    try {
      const response = await this.client!.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const latencyMs = Date.now() - startTime;

      const textContent = response.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in AI response');
      }

      const rawText = textContent.text.trim();
      const jsonText = this.extractJson(rawText);
      const parsed = JSON.parse(jsonText) as T;

      await this.prisma.aiRun.update({
        where: { id: aiRunId },
        data: {
          status: AiRunStatus.SUCCESS,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalCostUsd: this.calculateCost(
            response.usage.input_tokens,
            response.usage.output_tokens,
          ),
          latencyMs,
          responsePayload: parsed as object,
        },
      });

      return parsed;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(`AI run ${aiRunId} failed: ${errorMessage}`);

      await this.prisma.aiRun.update({
        where: { id: aiRunId },
        data: {
          status: AiRunStatus.FAILED,
          latencyMs,
          errorMessage,
        },
      });

      throw new BadRequestException(`AI processing failed: ${errorMessage}`);
    }
  }

  private extractJson(text: string): string {
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    const firstBracket = text.indexOf('[');
    const firstBrace = text.indexOf('{');

    if (firstBracket === -1 && firstBrace === -1) {
      return text;
    }

    if (
      firstBracket !== -1 &&
      (firstBrace === -1 || firstBracket < firstBrace)
    ) {
      const lastBracket = text.lastIndexOf(']');
      if (lastBracket > firstBracket) {
        return text.slice(firstBracket, lastBracket + 1);
      }
    }

    if (firstBrace !== -1) {
      const lastBrace = text.lastIndexOf('}');
      if (lastBrace > firstBrace) {
        return text.slice(firstBrace, lastBrace + 1);
      }
    }

    return text;
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    const inputCostPer1k = 0.003;
    const outputCostPer1k = 0.015;
    return Number(
      (
        (inputTokens / 1000) * inputCostPer1k +
        (outputTokens / 1000) * outputCostPer1k
      ).toFixed(4),
    );
  }

  private ensureConfigured(): void {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'AI service is not configured. Set CLAUDE_API_KEY.',
      );
    }
  }
}
