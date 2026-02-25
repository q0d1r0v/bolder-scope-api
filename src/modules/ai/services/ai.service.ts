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
import { DESIGN_SYSTEM_PROMPT } from '@/modules/wireframes/prompts/design-system.prompt';
import { LAYOUT_GENERATION_PROMPT } from '@/modules/wireframes/prompts/layout-generation.prompt';

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
  background?: string | null;
  fullWidth?: boolean;
  padding?: string | null;
  components: WireframeComponent[];
};

export type WireframeScreenData = {
  screenName: string;
  title: string;
  description: string;
  screenType?: string;
  sections: WireframeSection[];
};

export type WireframeDesignSystem = {
  colorPalette: Record<string, string>;
  darkColorPalette?: Record<string, string>;
  typography: Record<string, unknown>;
  spacing: Record<string, unknown>;
  shadows?: Record<string, string>;
  iconStyle?: string;
  iconStroke?: string;
};

export type WireframeResult = {
  screens: WireframeScreenData[];
  designSystem: WireframeDesignSystem;
  assumptions: string;
};

export type TextToDesignResult = {
  screens: WireframeScreenData[];
  designSystem: WireframeDesignSystem;
  navigationFlow: Array<{
    from: string;
    to: string;
    trigger: string;
    animationType?: string;
    condition?: string;
    sourceComponent?: string;
  }>;
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
    instruction?: string,
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
        requestPayload: { structuredJson, features, instruction } as object,
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

    const userMessage = instruction
      ? `Requirements:\n${JSON.stringify(structuredJson, null, 2)}\n\nFeatures:\n${JSON.stringify(features, null, 2)}\n\nAdditional instruction: ${instruction}`
      : `Requirements:\n${JSON.stringify(structuredJson, null, 2)}\n\nFeatures:\n${JSON.stringify(features, null, 2)}`;

    const result = await this.callClaude<TechStackResult>(
      aiRun.id,
      systemPrompt,
      userMessage,
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

const userMessage = `Requirements:\n${JSON.stringify(structuredJson, null, 2)}\n\nFeatures:\n${JSON.stringify(features, null, 2)}\n\nUser Flow Screens:\n${JSON.stringify(userFlowScreens, null, 2)}

Generate a complete wireframe with:
1. A premium design system with full color palette (including dark mode), typography scale, spacing, shadows
2. Detailed screen layouts for EVERY screen listed above
3. Use REALISTIC content — never lorem ipsum
4. Follow visual hierarchy and component density rules strictly

Return JSON with this structure:
{
  "screens": [{ "screenName": "...", "title": "...", "description": "...", "screenType": "page", "sections": [...] }],
  "designSystem": {
    "colorPalette": { "primary": "#...", "primaryHover": "#...", "primaryLight": "#...", "secondary": "#...", "accent": "#...", "background": "#...", "surface": "#...", "surfaceElevated": "#...", "text": "#...", "textSecondary": "#...", "textMuted": "#...", "textOnPrimary": "#...", "border": "#...", "borderLight": "#...", "error": "#...", "errorLight": "#...", "success": "#...", "successLight": "#...", "warning": "#...", "warningLight": "#...", "info": "#...", "infoLight": "#...", "neutral50": "#...", "neutral100": "#...", "neutral200": "#...", "neutral300": "#...", "neutral400": "#...", "neutral500": "#...", "neutral600": "#...", "neutral700": "#...", "neutral800": "#...", "neutral900": "#...", "neutral950": "#...", "gradientPrimary": "linear-gradient(...)", "gradientSubtle": "linear-gradient(...)" },
    "darkColorPalette": { /* same keys, dark mode values */ },
    "typography": { "fontFamily": "...", "headingFont": "...", "bodyFont": "...", "monoFont": "...", "scale": { "display": {...}, "h1": {...}, "h2": {...}, "h3": {...}, "h4": {...}, "h5": {...}, "body": {...}, "bodySm": {...}, "caption": {...} }, "headingSize": "28px", "bodySize": "14px" },
    "spacing": { "unit": "4px", "sectionGap": "32px", "componentGap": "16px", "containerMaxWidth": "1280px", "borderRadius": { "sm": "4px", "md": "8px", "lg": "12px", "xl": "16px", "full": "9999px" }, "borderRadius_legacy": "8px" },
    "shadows": { "xs": "...", "sm": "...", "md": "...", "lg": "...", "xl": "...", "2xl": "..." },
    "iconStyle": "lucide"
  },
  "assumptions": "string"
}`;

    const result = await this.callClaude<WireframeResult>(
      aiRun.id,
      LAYOUT_GENERATION_PROMPT,
      userMessage,
      16384,
    );

    return { result, aiRunId: aiRun.id };
  }

  async generateDesignFromText(
    prompt: string,
    options: {
      platform: string;
      style?: string;
      screenCount?: number;
      colorScheme?: string;
    },
    context?: { organizationId?: string; projectId?: string; userId: string },
  ): Promise<{ result: TextToDesignResult; aiRunId: string }> {
    this.ensureConfigured();

    const aiRun = await this.prisma.aiRun.create({
      data: {
        organizationId: context?.organizationId ?? null,
        projectId: context?.projectId ?? null,
        initiatedById: context?.userId ?? null,
        provider: AiProvider.CLAUDE,
        model: this.model,
        taskType: AiTaskType.TEXT_TO_DESIGN,
        status: AiRunStatus.QUEUED,
        requestPayload: { prompt, ...options } as object,
      },
    });

    const systemPrompt = this.buildTextToDesignPrompt(options);

    const result = await this.callClaude<TextToDesignResult>(
      aiRun.id,
      systemPrompt,
      prompt,
      16384,
    );

    return { result, aiRunId: aiRun.id };
  }

  private buildTextToDesignPrompt(options: {
    platform: string;
    style?: string;
    screenCount?: number;
    colorScheme?: string;
  }): string {
    const platformGuidance: Record<string, string> = {
      WEB: 'Design for desktop-first responsive web application. Use standard web patterns: navigation bars, sidebars, breadcrumbs, multi-column layouts. Minimum viewport width: 1280px.',
      MOBILE:
        'Design for mobile-first application (iOS/Android). Use standard mobile patterns: bottom tab bars, stacked navigation, swipe gestures, full-width components. Target viewport: 390x844px.',
      TABLET:
        'Design for tablet application. Use adaptive layout with split-view patterns, master-detail views, and touch-friendly tap targets. Target viewport: 820x1180px.',
    };

    const styleGuidance: Record<string, string> = {
      MODERN:
        'Use a modern design language: rounded corners (8-12px), subtle shadows, gradient accents, generous whitespace, card-based layouts.',
      MINIMAL:
        'Use a minimalist design language: clean lines, maximum whitespace, monochromatic palette with single accent color, flat design, no decorative elements.',
      CORPORATE:
        'Use a professional corporate design language: structured grid layouts, formal typography, conservative color palette, data-heavy layouts with tables and charts.',
      PLAYFUL:
        'Use a playful design language: bright bold colors, rounded shapes (16-24px radius), illustrated elements, large friendly typography, engaging micro-interactions.',
    };

    const screenCountInstruction = options.screenCount
      ? `Generate exactly ${options.screenCount} screens.`
      : 'Determine the appropriate number of screens based on the described features (typically 6-15 screens).';

    const colorInstruction = options.colorScheme
      ? `Use a color scheme based on: "${options.colorScheme}". Derive a FULL premium palette from this preference.`
      : 'Choose an appropriate color palette based on the application type and style.';

    return `You are a world-class UI/UX designer creating complete application designs from text descriptions. Your output must match the quality of a $100,000 design agency project — premium, polished, and production-ready for Konva canvas rendering.

## Your Process
1. Analyze the text description to identify the application's purpose, key features, and user personas
2. Determine all necessary screens and their navigation relationships
3. Design each screen with detailed component layouts using the component types below
4. Create a comprehensive design system (full color palette with dark mode, typography scale, spacing, shadows)

## Platform
${platformGuidance[options.platform] ?? platformGuidance['WEB']}

## Style
${options.style ? styleGuidance[options.style] ?? styleGuidance['MODERN'] : styleGuidance['MODERN']}

## Screen Count
${screenCountInstruction}

## Color Scheme
${colorInstruction}

## COMPONENT TYPES
Use these exact type names:

### NAVIGATION & STRUCTURE
- nav: { variant: "primary"|"default"|"vertical"|"transparent", items?: string[] }, children: [button, link, searchBar, avatar]
- sidebar: { variant: "default"|"compact"|"floating" }, children: [link, button, divider, heading]
- footer: { variant: "simple"|"complex"|"minimal" }, children: [link, text, heading]
- breadcrumb: label: "Home > Category > Item"

### TEXT & DISPLAY
- heading: { size: "sm"|"md"|"lg"|"xl"|"display" }, label: "..."
- text: { size: "sm"|"md"|"lg", maxLines?: number }, label: "REALISTIC text, NOT lorem ipsum"
- badge: { variant: "default"|"success"|"error"|"warning"|"info"|"primary"|"outline" }
- icon: { name?: string, size: "sm"|"md"|"lg" }

### FORM ELEMENTS
- input: { placeholder?: string, required?: boolean, inputType?: "text"|"email"|"password"|"number"|"tel"|"url" }
- select: { items?: string[], required?: boolean }
- checkbox: { checked?: boolean }
- toggle: { enabled?: boolean }
- slider: { min?: number, max?: number, showValue?: boolean }
- searchBar: { placeholder?: string }
- fileUpload: { accept?: string, multiple?: boolean }
- form: children: [input, select, checkbox, button]

### BUTTONS & LINKS
- button: { variant: "primary"|"secondary"|"outline"|"ghost"|"destructive", size: "sm"|"md"|"lg", icon?: string }
- link: { variant: "primary"|"default"|"muted" }

### MEDIA
- image: { size: "sm"|"md"|"lg"|"hero", aspectRatio?: "1:1"|"16:9"|"4:3"|"3:2" }
- avatar: { size: "sm"|"md"|"lg", shape?: "circle"|"square" }
- video: { aspectRatio?: "16:9"|"4:3" }

### DATA DISPLAY
- card: { variant: "default"|"primary"|"outline"|"ghost"|"success"|"elevated" }, children: [...]
- table: { items?: string[], columns?: number }
- list: { columns?: number, items?: string[] }, children: [ONE template]
- stats: { value?: string, trend?: "up"|"down"|"neutral", trendValue?: string }
- chart: { chartType?: "bar"|"line"|"pie"|"donut"|"area", height?: "sm"|"md"|"lg" }
- timeline: { itemCount?: number }, children: [card or text]

### NAVIGATION & FLOW
- tab: children: [one child per tab]
- accordion: { defaultOpen?: number }, children: [card per section]
- stepper: { steps?: string[], activeStep?: number }
- pagination: {}
- progressBar: { value?: number }

### LAYOUT & SPECIAL
- divider: {}
- skeleton: { lines?: number, hasAvatar?: boolean, hasImage?: boolean }
- hero: { alignment?: "left"|"center", hasImage?: boolean }, children: [heading, text, button, image]
- pricing: { price?: string, period?: string, featured?: boolean }, children: [text as features]
- testimonial: { rating?: number }, children: [avatar, text]
- map: { height?: "sm"|"md"|"lg" }

### SECTION LAYOUTS
Each section has: name, layout ("row"|"column"|"grid"|"stack"|"sidebar-left"|"sidebar-right"|"split"), background (optional hex), fullWidth (bool), padding ("none"|"sm"|"md"|"lg"|"xl")

### COMPONENT WIDTH (optional prop)
width: "full"|"1/2"|"1/3"|"2/3"|"1/4"|"3/4"|"auto"

## Output JSON Schema
{
  "screens": [
    {
      "screenName": "PascalCase name",
      "title": "Display title",
      "description": "What this screen shows",
      "screenType": "page",
      "sections": [
        {
          "name": "Section Name",
          "layout": "column",
          "background": null,
          "fullWidth": false,
          "padding": null,
          "components": [{ "type": "...", "label": "...", "props": {...}, "children": [...] }]
        }
      ]
    }
  ],
  "designSystem": {
    "colorPalette": {
      "primary": "#HEX", "primaryHover": "#HEX", "primaryPressed": "#HEX", "primaryLight": "#HEX", "primaryGhost": "#HEX",
      "secondary": "#HEX", "secondaryHover": "#HEX", "secondaryLight": "#HEX",
      "accent": "#HEX", "accentHover": "#HEX",
      "neutral50": "#HEX", "neutral100": "#HEX", "neutral200": "#HEX", "neutral300": "#HEX", "neutral400": "#HEX",
      "neutral500": "#HEX", "neutral600": "#HEX", "neutral700": "#HEX", "neutral800": "#HEX", "neutral900": "#HEX", "neutral950": "#HEX",
      "background": "#HEX", "surface": "#HEX", "surfaceElevated": "#HEX", "surfaceOverlay": "#HEX",
      "text": "#HEX", "textSecondary": "#HEX", "textMuted": "#HEX", "textOnPrimary": "#HEX", "textDisabled": "#HEX",
      "border": "#HEX", "borderLight": "#HEX", "borderFocusRing": "#HEX",
      "error": "#HEX", "errorLight": "#HEX", "errorText": "#HEX",
      "success": "#HEX", "successLight": "#HEX", "successText": "#HEX",
      "warning": "#HEX", "warningLight": "#HEX", "warningText": "#HEX",
      "info": "#HEX", "infoLight": "#HEX", "infoText": "#HEX",
      "gradientPrimary": "linear-gradient(...)", "gradientSubtle": "linear-gradient(...)"
    },
    "darkColorPalette": { /* same keys with dark mode values */ },
    "typography": {
      "fontFamily": "Inter, system-ui, sans-serif", "headingFont": "...", "bodyFont": "...", "monoFont": "...",
      "scale": {
        "display": { "size": "60px", "lineHeight": "1.1", "weight": "800", "letterSpacing": "-0.025em" },
        "h1": { "size": "48px", "lineHeight": "1.15", "weight": "700", "letterSpacing": "-0.02em" },
        "h2": { "size": "36px", "lineHeight": "1.2", "weight": "700", "letterSpacing": "-0.015em" },
        "h3": { "size": "28px", "lineHeight": "1.3", "weight": "600", "letterSpacing": "-0.01em" },
        "h4": { "size": "22px", "lineHeight": "1.35", "weight": "600" },
        "h5": { "size": "18px", "lineHeight": "1.4", "weight": "600" },
        "body": { "size": "16px", "lineHeight": "1.6", "weight": "400" },
        "bodySm": { "size": "14px", "lineHeight": "1.5", "weight": "400" },
        "caption": { "size": "12px", "lineHeight": "1.4", "weight": "500", "letterSpacing": "0.02em" },
        "overline": { "size": "11px", "lineHeight": "1.4", "weight": "600", "letterSpacing": "0.08em" }
      },
      "headingSize": "28px", "bodySize": "14px"
    },
    "spacing": {
      "unit": "4px", "sectionGap": "32px", "componentGap": "16px", "containerMaxWidth": "1280px", "containerPadding": "24px",
      "borderRadius": { "none": "0px", "sm": "4px", "md": "8px", "lg": "12px", "xl": "16px", "2xl": "24px", "full": "9999px" },
      "borderRadius_legacy": "8px"
    },
    "shadows": { "xs": "...", "sm": "...", "md": "...", "lg": "...", "xl": "...", "2xl": "...", "inner": "...", "primaryGlow": "..." },
    "iconStyle": "lucide", "iconStroke": "1.5px"
  },
  "navigationFlow": [
    { "from": "ScreenA", "to": "ScreenB", "trigger": "action description", "animationType": "push|modal|replace|fade", "condition": "optional", "sourceComponent": "Button label" }
  ],
  "assumptions": "string"
}

## CRITICAL DESIGN RULES
1. REAL CONTENT — Never use lorem ipsum. Write realistic, contextual placeholder text
2. VISUAL HIERARCHY — Every screen must have one primary heading and one primary CTA
3. Max 3 CTA buttons per screen, max 6 nav items, max 4 cards per row
4. Every input MUST have a label, every image a descriptive label
5. Buttons must have clear action-oriented labels ("Add to Cart" not "Submit")
6. ALL colors must pass WCAG AA contrast ratio
7. ${options.platform === 'MOBILE' ? 'Use bottom tab bar for navigation, column layouts, larger touch targets' : 'Use top navigation bar/sidebar, multi-column layouts where appropriate'}
8. Every screen must be reachable via the navigationFlow

Return ONLY valid JSON. No text outside the JSON object.`;
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

  async refineScreenLayout(
    screenName: string,
    currentLayoutJson: Record<string, unknown>,
    designSystem: Record<string, unknown>,
    instruction: string,
    context?: { organizationId?: string; projectId?: string; userId: string },
  ): Promise<{ result: { layoutJson: Record<string, unknown> }; aiRunId: string }> {
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
        requestPayload: { screenName, instruction, action: 'refine' } as object,
      },
    });

const userMessage = `You are refining an existing wireframe screen based on user feedback.

CURRENT SCREEN:
Name: ${screenName}
Layout JSON: ${JSON.stringify(currentLayoutJson, null, 2)}

DESIGN SYSTEM IN USE:
${JSON.stringify(designSystem, null, 2)}

USER INSTRUCTION:
"${instruction}"

RULES:
1. ONLY modify what the user asked for
2. Keep everything else EXACTLY the same
3. Maintain the same component types and structure where not changed
4. Follow the design system
5. Return the COMPLETE updated layoutJson (not just changed parts)
6. Use realistic content, never lorem ipsum

Return ONLY the updated layoutJson object as valid JSON: { "title": "...", "sections": [...] }`;

    const result = await this.callClaude<Record<string, unknown>>(
      aiRun.id,
      LAYOUT_GENERATION_PROMPT,
      userMessage,
      8192,
    );

    return { result: { layoutJson: result }, aiRunId: aiRun.id };
  }

  async regenerateScreenLayout(
    screenName: string,
    screenDescription: string,
    designSystem: Record<string, unknown>,
    platform: string,
    style: string,
    instruction?: string,
    context?: { organizationId?: string; projectId?: string; userId: string },
  ): Promise<{ result: { layoutJson: Record<string, unknown> }; aiRunId: string }> {
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
        requestPayload: { screenName, instruction, action: 'regenerate' } as object,
      },
    });

const userMessage = `Generate a completely NEW wireframe layout for this screen from scratch.

Screen Name: ${screenName}
Screen Description: ${screenDescription}
Platform: ${platform}
Style: ${style}
${instruction ? `Additional instruction: ${instruction}` : ''}

DESIGN SYSTEM TO USE:
${JSON.stringify(designSystem, null, 2)}

Create a fresh, premium-quality layout following the design system and component type rules.
Use realistic content, never lorem ipsum.

Return ONLY the layoutJson object as valid JSON: { "title": "...", "sections": [...] }`;

    const result = await this.callClaude<Record<string, unknown>>(
      aiRun.id,
      LAYOUT_GENERATION_PROMPT,
      userMessage,
      8192,
    );

    return { result: { layoutJson: result }, aiRunId: aiRun.id };
  }

  async generateSingleScreenLayout(
    screenName: string,
    screenDescription: string,
    designSystem: Record<string, unknown>,
    existingScreenNames: string[],
    platform: string,
    style: string,
    instruction?: string,
    context?: { organizationId?: string; projectId?: string; userId: string },
  ): Promise<{ result: { layoutJson: Record<string, unknown> }; aiRunId: string }> {
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
        requestPayload: { screenName, screenDescription, instruction, action: 'add-screen' } as object,
      },
    });

const userMessage = `Generate a wireframe layout for a NEW screen to add to an existing wireframe project.

NEW SCREEN:
Name: ${screenName}
Description: ${screenDescription}
${instruction ? `Additional instruction: ${instruction}` : ''}

EXISTING SCREENS (for navigation context): ${existingScreenNames.join(', ')}
Platform: ${platform}
Style: ${style}

DESIGN SYSTEM TO USE:
${JSON.stringify(designSystem, null, 2)}

RULES:
- The new screen must fit cohesively with existing screens
- Include navigation that connects to existing screens
- Use realistic content, never lorem ipsum
- Follow the design system strictly
- Create premium, $100K agency quality layout

Return ONLY the layoutJson object as valid JSON: { "title": "...", "sections": [...] }`;

    const result = await this.callClaude<Record<string, unknown>>(
      aiRun.id,
      LAYOUT_GENERATION_PROMPT,
      userMessage,
      8192,
    );

    return { result: { layoutJson: result }, aiRunId: aiRun.id };
  }

  async applyStyleToScreens(
    screens: Array<{ name: string; layoutJson: Record<string, unknown> }>,
    designSystem: Record<string, unknown>,
    instruction: string,
    context?: { organizationId?: string; projectId?: string; userId: string },
  ): Promise<{
    result: { screens: Array<{ screenName: string; layoutJson: Record<string, unknown> }> };
    aiRunId: string;
  }> {
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
        requestPayload: { instruction, screenCount: screens.length, action: 'apply-style' } as object,
      },
    });

const userMessage = `Apply a style change across ALL screens in a wireframe project.

STYLE INSTRUCTION: "${instruction}"

CURRENT SCREENS:
${JSON.stringify(screens, null, 2)}

CURRENT DESIGN SYSTEM:
${JSON.stringify(designSystem, null, 2)}

RULES:
1. Apply the style instruction consistently across ALL screens
2. Keep the content and structure the same — only modify visual styling aspects
3. If the instruction affects the design system (colors, fonts, spacing), update accordingly
4. Return ALL screens with their updated layoutJson

Return valid JSON:
{
  "screens": [
    { "screenName": "ScreenName", "layoutJson": { "title": "...", "sections": [...] } }
  ]
}`;

    const result = await this.callClaude<{
      screens: Array<{ screenName: string; layoutJson: Record<string, unknown> }>;
    }>(aiRun.id, LAYOUT_GENERATION_PROMPT, userMessage, 16384);

    return { result, aiRunId: aiRun.id };
  }

  async regenerateDesignSystem(
    currentDesignSystem: Record<string, unknown>,
    projectDescription: string,
    platform: string,
    style: string,
    instruction?: string,
    colorScheme?: string,
    context?: { organizationId?: string; projectId?: string; userId: string },
  ): Promise<{ result: Record<string, unknown>; aiRunId: string }> {
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
        requestPayload: { instruction, colorScheme, action: 'regenerate-design-system' } as object,
      },
    });

const userMessage = `Generate a NEW premium design system for this project.

Project: ${projectDescription}
Platform: ${platform}
Style: ${style}
${instruction ? `Instruction: ${instruction}` : ''}
${colorScheme ? `Color preference: ${colorScheme}` : ''}

Current design system for reference (improve upon it):
${JSON.stringify(currentDesignSystem, null, 2)}

Return ONLY the complete design system JSON with colorPalette, darkColorPalette, typography, spacing, shadows, iconStyle.`;

    const result = await this.callClaude<Record<string, unknown>>(
      aiRun.id,
      DESIGN_SYSTEM_PROMPT,
      userMessage,
      8192,
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

      let parsed: T;
      try {
        parsed = JSON.parse(jsonText) as T;
      } catch {
        if (response.stop_reason === 'max_tokens') {
          this.logger.warn(
            `AI run ${aiRunId}: response truncated (max_tokens reached), attempting JSON repair`,
          );
          const repaired = this.repairTruncatedJson(jsonText);
          parsed = JSON.parse(repaired) as T;
        } else {
          throw new Error(
            'AI returned invalid JSON that could not be parsed',
          );
        }
      }

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

  private repairTruncatedJson(text: string): string {
    // Remove any trailing incomplete string value (cut mid-string)
    let repaired = text.replace(/,\s*"[^"]*$/, '');
    repaired = repaired.replace(/,\s*$/, '');
    // Remove incomplete key-value pairs like `"key": ` or `"key": "val`
    repaired = repaired.replace(/,?\s*"[^"]*"\s*:\s*("([^"\\]|\\.)*)?$/, '');
    repaired = repaired.replace(/,?\s*"[^"]*"\s*:\s*\[?\s*$/, '');

    // Count unclosed brackets and braces
    const stack: string[] = [];
    let inString = false;
    let escape = false;

    for (const ch of repaired) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') stack.pop();
    }

    // If we're still inside a string, close it
    if (inString) {
      repaired += '"';
    }

    // Remove any trailing comma before closing
    repaired = repaired.replace(/,\s*$/, '');

    // Close all unclosed brackets/braces in reverse order
    while (stack.length > 0) {
      repaired += stack.pop();
    }

    return repaired;
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
