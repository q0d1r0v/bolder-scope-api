import { Injectable, Logger } from '@nestjs/common';
import type {
  WireframeComponent,
  WireframeDesignSystem,
  WireframeScreenData,
  WireframeSection,
} from '@/modules/ai/services/ai.service';

// ─── Beautified Output Types ───

export type ResolvedStyle = {
  backgroundColor?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  padding?: string;
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  margin?: string;
  borderRadius?: string;
  border?: string;
  borderColor?: string;
  boxShadow?: string;
  width?: string;
  height?: string;
  minHeight?: string;
  gap?: string;
  display?: string;
  flexDirection?: string;
  alignItems?: string;
  justifyContent?: string;
  gridTemplateColumns?: string;
  textAlign?: string;
  textTransform?: string;
  opacity?: string;
  cursor?: string;
  overflow?: string;
  position?: string;
  background?: string;
};

export type BeautifiedComponent = {
  type: string;
  label?: string;
  props?: Record<string, unknown>;
  style: ResolvedStyle;
  children?: BeautifiedComponent[];
};

export type BeautifiedSection = {
  name: string;
  layout: string;
  style: ResolvedStyle;
  components: BeautifiedComponent[];
};

export type BeautifiedScreen = {
  screenName: string;
  title: string;
  description: string;
  screenType: string;
  style: ResolvedStyle;
  sections: BeautifiedSection[];
};

export type BeautifyResult = {
  screens: BeautifiedScreen[];
  resolvedTokens: {
    colors: Record<string, string>;
    typography: Record<string, ResolvedStyle>;
    spacing: Record<string, string>;
    shadows: Record<string, string>;
    radii: Record<string, string>;
  };
};

// ─── Default Fallback Tokens ───

const DEFAULT_COLORS: Record<string, string> = {
  primary: '#6366F1',
  primaryHover: '#4F46E5',
  primaryLight: '#EEF2FF',
  primaryGhost: 'rgba(99,102,241,0.08)',
  secondary: '#8B5CF6',
  secondaryHover: '#7C3AED',
  accent: '#F59E0B',
  background: '#FFFFFF',
  surface: '#F8FAFC',
  surfaceElevated: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textOnPrimary: '#FFFFFF',
  textDisabled: '#CBD5E1',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  borderFocusRing: '#6366F1',
  error: '#EF4444',
  errorLight: '#FEF2F2',
  errorText: '#991B1B',
  success: '#10B981',
  successLight: '#F0FDF4',
  successText: '#166534',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  warningText: '#92400E',
  info: '#3B82F6',
  infoLight: '#EFF6FF',
  infoText: '#1E40AF',
};

const DEFAULT_TYPOGRAPHY: Record<string, { size: string; lineHeight: string; weight: string; letterSpacing: string }> = {
  display: { size: '60px', lineHeight: '1.1', weight: '800', letterSpacing: '-0.025em' },
  h1: { size: '48px', lineHeight: '1.15', weight: '700', letterSpacing: '-0.02em' },
  h2: { size: '36px', lineHeight: '1.2', weight: '700', letterSpacing: '-0.015em' },
  h3: { size: '28px', lineHeight: '1.3', weight: '600', letterSpacing: '-0.01em' },
  h4: { size: '22px', lineHeight: '1.35', weight: '600', letterSpacing: '0' },
  h5: { size: '18px', lineHeight: '1.4', weight: '600', letterSpacing: '0' },
  h6: { size: '16px', lineHeight: '1.4', weight: '600', letterSpacing: '0' },
  bodyLg: { size: '18px', lineHeight: '1.6', weight: '400', letterSpacing: '0' },
  body: { size: '16px', lineHeight: '1.6', weight: '400', letterSpacing: '0' },
  bodySm: { size: '14px', lineHeight: '1.5', weight: '400', letterSpacing: '0' },
  caption: { size: '12px', lineHeight: '1.4', weight: '500', letterSpacing: '0.02em' },
  overline: { size: '11px', lineHeight: '1.4', weight: '600', letterSpacing: '0.08em' },
};

const DEFAULT_SPACING: Record<string, string> = {
  '0': '0px', '0.5': '2px', '1': '4px', '1.5': '6px',
  '2': '8px', '2.5': '10px', '3': '12px', '4': '16px',
  '5': '20px', '6': '24px', '8': '32px', '10': '40px',
  '12': '48px', '16': '64px', '20': '80px', '24': '96px',
};

const DEFAULT_SHADOWS: Record<string, string> = {
  xs: '0 1px 2px 0 rgba(0,0,0,0.05)',
  sm: '0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)',
  md: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
  lg: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
  xl: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
  '2xl': '0 25px 50px -12px rgba(0,0,0,0.25)',
  inner: 'inset 0 2px 4px 0 rgba(0,0,0,0.05)',
};

const DEFAULT_RADII: Record<string, string> = {
  none: '0px', sm: '4px', md: '8px', lg: '12px',
  xl: '16px', '2xl': '24px', full: '9999px',
};

const SEMANTIC_PADDING: Record<string, string> = {
  none: '0px',
  sm: '12px',
  md: '24px',
  lg: '32px',
  xl: '48px',
};

const HEADING_SIZE_TO_TYPO: Record<string, string> = {
  display: 'display',
  xl: 'h1',
  lg: 'h2',
  md: 'h3',
  sm: 'h5',
};

const TEXT_SIZE_TO_TYPO: Record<string, string> = {
  lg: 'bodyLg',
  md: 'body',
  sm: 'bodySm',
};

const WIDTH_MAP: Record<string, string> = {
  full: '100%',
  '1/2': '50%',
  '1/3': '33.333%',
  '2/3': '66.666%',
  '1/4': '25%',
  '3/4': '75%',
  auto: 'auto',
};

const IMAGE_SIZE_MAP: Record<string, { width: string; height: string }> = {
  sm: { width: '100%', height: '120px' },
  md: { width: '100%', height: '240px' },
  lg: { width: '100%', height: '400px' },
  hero: { width: '100%', height: '560px' },
};

const AVATAR_SIZE_MAP: Record<string, string> = {
  sm: '32px', md: '48px', lg: '80px',
};

const CHART_HEIGHT_MAP: Record<string, string> = {
  sm: '200px', md: '320px', lg: '480px',
};

const BUTTON_PADDING: Record<string, string> = {
  sm: '6px 12px',
  md: '10px 20px',
  lg: '14px 28px',
};

const BUTTON_FONT_SIZE: Record<string, string> = {
  sm: '13px', md: '14px', lg: '16px',
};

@Injectable()
export class WireframeBeautifierService {
  private readonly logger = new Logger(WireframeBeautifierService.name);

  // ─── Main Entry Point ───

  beautify(
    screens: WireframeScreenData[],
    designSystem?: WireframeDesignSystem,
  ): BeautifyResult {
    const colors = this.resolveColors(designSystem);
    const typography = this.resolveTypography(designSystem);
    const spacing = this.resolveSpacing(designSystem);
    const shadows = this.resolveShadows(designSystem);
    const radii = this.resolveRadii(designSystem);

    const ctx: TokenContext = { colors, typography, spacing, shadows, radii };

    const beautifiedScreens = screens.map((screen) =>
      this.beautifyScreen(screen, ctx),
    );

    // Build resolved token map for typography
    const typographyTokens: Record<string, ResolvedStyle> = {};
    for (const [key, val] of Object.entries(typography)) {
      typographyTokens[key] = {
        fontSize: val.size,
        fontWeight: val.weight,
        lineHeight: val.lineHeight,
        letterSpacing: val.letterSpacing,
      };
    }

    return {
      screens: beautifiedScreens,
      resolvedTokens: {
        colors,
        typography: typographyTokens,
        spacing,
        shadows,
        radii,
      },
    };
  }

  // ─── Screen Beautification ───

  private beautifyScreen(
    screen: WireframeScreenData,
    ctx: TokenContext,
  ): BeautifiedScreen {
    return {
      screenName: screen.screenName,
      title: screen.title || screen.screenName,
      description: screen.description,
      screenType: screen.screenType ?? 'page',
      style: {
        backgroundColor: ctx.colors.background,
        color: ctx.colors.text,
        fontFamily: this.resolveFont(ctx),
        minHeight: '100vh',
      },
      sections: screen.sections.map((section) =>
        this.beautifySection(section, ctx),
      ),
    };
  }

  // ─── Section Beautification ───

  private beautifySection(
    section: WireframeSection,
    ctx: TokenContext,
  ): BeautifiedSection {
    const style: ResolvedStyle = {};

    // Layout → display properties
    switch (section.layout) {
      case 'row':
        style.display = 'flex';
        style.flexDirection = 'row';
        style.alignItems = 'center';
        style.gap = ctx.spacing['4'] ?? '16px';
        break;
      case 'column':
        style.display = 'flex';
        style.flexDirection = 'column';
        style.gap = ctx.spacing['4'] ?? '16px';
        break;
      case 'grid':
        style.display = 'grid';
        style.gridTemplateColumns = 'repeat(auto-fit, minmax(280px, 1fr))';
        style.gap = ctx.spacing['6'] ?? '24px';
        break;
      case 'stack':
        style.display = 'flex';
        style.flexDirection = 'column';
        style.gap = ctx.spacing['2'] ?? '8px';
        break;
      case 'sidebar-left':
        style.display = 'grid';
        style.gridTemplateColumns = '280px 1fr';
        style.gap = ctx.spacing['6'] ?? '24px';
        break;
      case 'sidebar-right':
        style.display = 'grid';
        style.gridTemplateColumns = '1fr 280px';
        style.gap = ctx.spacing['6'] ?? '24px';
        break;
      case 'split':
        style.display = 'grid';
        style.gridTemplateColumns = '1fr 1fr';
        style.gap = ctx.spacing['8'] ?? '32px';
        break;
      default:
        style.display = 'flex';
        style.flexDirection = 'column';
        style.gap = ctx.spacing['4'] ?? '16px';
    }

    // Padding
    if (section.padding) {
      style.padding = SEMANTIC_PADDING[section.padding] ?? ctx.spacing['6'] ?? '24px';
    } else {
      style.padding = ctx.spacing['6'] ?? '24px';
    }

    // Full width
    if (section.fullWidth) {
      style.width = '100%';
    }

    // Background
    if (section.background) {
      if (section.background === 'gradient') {
        style.background = ctx.colors.gradientSubtle ?? ctx.colors.gradientPrimary
          ?? `linear-gradient(135deg, ${ctx.colors.primary}08, ${ctx.colors.secondary}08)`;
      } else {
        style.backgroundColor = section.background;
      }
    }

    return {
      name: section.name,
      layout: section.layout,
      style,
      components: section.components.map((comp) =>
        this.beautifyComponent(comp, ctx),
      ),
    };
  }

  // ─── Component Beautification ───

  private beautifyComponent(
    component: WireframeComponent,
    ctx: TokenContext,
  ): BeautifiedComponent {
    const style = this.resolveComponentStyle(component, ctx);

    // Width prop
    if (component.props?.width) {
      const w = WIDTH_MAP[component.props.width as string];
      if (w) style.width = w;
    }

    return {
      type: component.type,
      label: component.label,
      props: component.props,
      style,
      children: component.children?.map((child) =>
        this.beautifyComponent(child, ctx),
      ),
    };
  }

  private resolveComponentStyle(
    comp: WireframeComponent,
    ctx: TokenContext,
  ): ResolvedStyle {
    switch (comp.type) {
      // ─── Navigation ───
      case 'nav':
        return this.resolveNavStyle(comp, ctx);
      case 'sidebar':
        return this.resolveSidebarStyle(comp, ctx);
      case 'footer':
        return this.resolveFooterStyle(comp, ctx);

      // ─── Text ───
      case 'heading':
        return this.resolveHeadingStyle(comp, ctx);
      case 'text':
        return this.resolveTextStyle(comp, ctx);
      case 'badge':
        return this.resolveBadgeStyle(comp, ctx);

      // ─── Buttons ───
      case 'button':
        return this.resolveButtonStyle(comp, ctx);
      case 'link':
        return this.resolveLinkStyle(comp, ctx);

      // ─── Form ───
      case 'input':
      case 'select':
        return this.resolveInputStyle(ctx);
      case 'checkbox':
      case 'toggle':
        return this.resolveCheckboxStyle(ctx);
      case 'searchBar':
        return this.resolveSearchBarStyle(ctx);
      case 'form':
        return { display: 'flex', flexDirection: 'column', gap: ctx.spacing['4'] ?? '16px' };

      // ─── Media ───
      case 'image':
        return this.resolveImageStyle(comp, ctx);
      case 'avatar':
        return this.resolveAvatarStyle(comp, ctx);
      case 'video':
        return this.resolveVideoStyle(ctx);

      // ─── Cards & Data ───
      case 'card':
        return this.resolveCardStyle(comp, ctx);
      case 'table':
        return this.resolveTableStyle(ctx);
      case 'stats':
        return this.resolveStatsStyle(ctx);
      case 'chart':
        return this.resolveChartStyle(comp, ctx);
      case 'list':
        return this.resolveListStyle(comp, ctx);

      // ─── Navigation Flow ───
      case 'tab':
        return { display: 'flex', flexDirection: 'column', gap: '0px' };
      case 'accordion':
        return { display: 'flex', flexDirection: 'column', gap: ctx.spacing['2'] ?? '8px' };
      case 'stepper':
        return this.resolveStepperStyle(ctx);
      case 'pagination':
        return { display: 'flex', flexDirection: 'row', gap: ctx.spacing['1'] ?? '4px', alignItems: 'center', justifyContent: 'center' };
      case 'progressBar':
        return this.resolveProgressBarStyle(comp, ctx);
      case 'breadcrumb':
        return { fontSize: '14px', color: ctx.colors.textMuted, display: 'flex', gap: ctx.spacing['2'] ?? '8px' };

      // ─── Layout ───
      case 'divider':
        return { borderColor: ctx.colors.borderLight, height: '1px', width: '100%' };
      case 'hero':
        return this.resolveHeroStyle(comp, ctx);
      case 'pricing':
        return this.resolvePricingStyle(comp, ctx);
      case 'testimonial':
        return { backgroundColor: ctx.colors.surface, borderRadius: ctx.radii.lg, padding: ctx.spacing['6'] ?? '24px', boxShadow: ctx.shadows.sm };
      case 'skeleton':
        return { backgroundColor: ctx.colors.borderLight, borderRadius: ctx.radii.md, minHeight: '20px', opacity: '0.6' };
      case 'map':
        return { backgroundColor: ctx.colors.surface, borderRadius: ctx.radii.lg, minHeight: CHART_HEIGHT_MAP[(comp.props?.height as string) ?? 'md'], border: `1px solid ${ctx.colors.border}` };
      case 'timeline':
        return { display: 'flex', flexDirection: 'column', gap: ctx.spacing['4'] ?? '16px', paddingLeft: ctx.spacing['6'] ?? '24px' };
      case 'fileUpload':
        return { border: `2px dashed ${ctx.colors.border}`, borderRadius: ctx.radii.lg, padding: ctx.spacing['8'] ?? '32px', textAlign: 'center', backgroundColor: ctx.colors.surface, cursor: 'pointer' };
      case 'slider':
        return { width: '100%', minHeight: '40px' };
      case 'icon':
        return { color: ctx.colors.textSecondary };

      default:
        return {};
    }
  }

  // ─── Individual Component Style Resolvers ───

  private resolveNavStyle(comp: WireframeComponent, ctx: TokenContext): ResolvedStyle {
    const variant = (comp.props?.variant as string) ?? 'primary';
    const base: ResolvedStyle = {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: `${ctx.spacing['3'] ?? '12px'} ${ctx.spacing['6'] ?? '24px'}`,
      width: '100%',
    };

    switch (variant) {
      case 'primary':
        return { ...base, backgroundColor: ctx.colors.primary, color: ctx.colors.textOnPrimary, boxShadow: ctx.shadows.sm };
      case 'transparent':
        return { ...base, backgroundColor: 'transparent', color: ctx.colors.text };
      case 'vertical':
        return { ...base, flexDirection: 'column', alignItems: 'flex-start', width: '280px', padding: ctx.spacing['4'] ?? '16px', backgroundColor: ctx.colors.surface, minHeight: '100vh', borderColor: ctx.colors.border };
      default:
        return { ...base, backgroundColor: ctx.colors.surface, color: ctx.colors.text, borderColor: ctx.colors.border, boxShadow: ctx.shadows.xs };
    }
  }

  private resolveSidebarStyle(comp: WireframeComponent, ctx: TokenContext): ResolvedStyle {
    const variant = (comp.props?.variant as string) ?? 'default';
    const base: ResolvedStyle = {
      display: 'flex',
      flexDirection: 'column',
      gap: ctx.spacing['1'] ?? '4px',
      backgroundColor: ctx.colors.surface,
      padding: ctx.spacing['4'] ?? '16px',
      minHeight: '100vh',
    };

    if (variant === 'compact') {
      return { ...base, width: '64px', alignItems: 'center', padding: ctx.spacing['2'] ?? '8px' };
    }
    if (variant === 'floating') {
      return { ...base, width: '260px', borderRadius: ctx.radii.xl, boxShadow: ctx.shadows.xl, margin: ctx.spacing['4'] ?? '16px', minHeight: 'auto' };
    }
    return { ...base, width: '280px', borderColor: ctx.colors.border };
  }

  private resolveFooterStyle(comp: WireframeComponent, ctx: TokenContext): ResolvedStyle {
    return {
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: `${ctx.spacing['10'] ?? '40px'} ${ctx.spacing['6'] ?? '24px'}`,
      backgroundColor: ctx.colors.neutral900 ?? '#0F172A',
      color: ctx.colors.neutral200 ?? '#E2E8F0',
      gap: ctx.spacing['8'] ?? '32px',
      width: '100%',
    };
  }

  private resolveHeadingStyle(comp: WireframeComponent, ctx: TokenContext): ResolvedStyle {
    const size = (comp.props?.size as string) ?? 'md';
    const typoKey = HEADING_SIZE_TO_TYPO[size] ?? 'h3';
    const typo = ctx.typography[typoKey] ?? DEFAULT_TYPOGRAPHY.h3;
    return {
      fontSize: typo.size,
      fontWeight: typo.weight,
      lineHeight: typo.lineHeight,
      letterSpacing: typo.letterSpacing,
      color: ctx.colors.text,
      fontFamily: this.resolveHeadingFont(ctx),
    };
  }

  private resolveTextStyle(comp: WireframeComponent, ctx: TokenContext): ResolvedStyle {
    const size = (comp.props?.size as string) ?? 'md';
    const typoKey = TEXT_SIZE_TO_TYPO[size] ?? 'body';
    const typo = ctx.typography[typoKey] ?? DEFAULT_TYPOGRAPHY.body;
    return {
      fontSize: typo.size,
      fontWeight: typo.weight,
      lineHeight: typo.lineHeight,
      letterSpacing: typo.letterSpacing,
      color: ctx.colors.textSecondary,
    };
  }

  private resolveBadgeStyle(comp: WireframeComponent, ctx: TokenContext): ResolvedStyle {
    const variant = (comp.props?.variant as string) ?? 'default';
    const base: ResolvedStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      fontSize: '12px',
      fontWeight: '500',
      padding: '2px 10px',
      borderRadius: ctx.radii.full,
      letterSpacing: '0.02em',
    };

    const variantStyles: Record<string, Partial<ResolvedStyle>> = {
      default: { backgroundColor: ctx.colors.surface, color: ctx.colors.text, border: `1px solid ${ctx.colors.border}` },
      primary: { backgroundColor: ctx.colors.primaryLight, color: ctx.colors.primary },
      success: { backgroundColor: ctx.colors.successLight, color: ctx.colors.successText },
      error: { backgroundColor: ctx.colors.errorLight, color: ctx.colors.errorText },
      warning: { backgroundColor: ctx.colors.warningLight, color: ctx.colors.warningText },
      info: { backgroundColor: ctx.colors.infoLight, color: ctx.colors.infoText },
      outline: { backgroundColor: 'transparent', color: ctx.colors.textSecondary, border: `1px solid ${ctx.colors.border}` },
    };

    return { ...base, ...(variantStyles[variant] ?? variantStyles.default) };
  }

  private resolveButtonStyle(comp: WireframeComponent, ctx: TokenContext): ResolvedStyle {
    const variant = (comp.props?.variant as string) ?? 'primary';
    const size = (comp.props?.size as string) ?? 'md';

    const base: ResolvedStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: ctx.spacing['2'] ?? '8px',
      fontWeight: '600',
      borderRadius: ctx.radii.md,
      cursor: 'pointer',
      padding: BUTTON_PADDING[size] ?? BUTTON_PADDING.md,
      fontSize: BUTTON_FONT_SIZE[size] ?? BUTTON_FONT_SIZE.md,
      lineHeight: '1.4',
    };

    const variantStyles: Record<string, Partial<ResolvedStyle>> = {
      primary: { backgroundColor: ctx.colors.primary, color: ctx.colors.textOnPrimary, boxShadow: ctx.shadows.sm },
      secondary: { backgroundColor: ctx.colors.secondary, color: ctx.colors.textOnPrimary },
      outline: { backgroundColor: 'transparent', color: ctx.colors.primary, border: `1.5px solid ${ctx.colors.primary}` },
      ghost: { backgroundColor: 'transparent', color: ctx.colors.primary },
      destructive: { backgroundColor: ctx.colors.error, color: '#FFFFFF', boxShadow: ctx.shadows.sm },
    };

    return { ...base, ...(variantStyles[variant] ?? variantStyles.primary) };
  }

  private resolveLinkStyle(comp: WireframeComponent, ctx: TokenContext): ResolvedStyle {
    const variant = (comp.props?.variant as string) ?? 'primary';
    const colorMap: Record<string, string> = {
      primary: ctx.colors.primary,
      default: ctx.colors.text,
      muted: ctx.colors.textMuted,
    };
    return {
      color: colorMap[variant] ?? ctx.colors.primary,
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
    };
  }

  private resolveInputStyle(ctx: TokenContext): ResolvedStyle {
    return {
      display: 'flex',
      flexDirection: 'column',
      gap: ctx.spacing['1.5'] ?? '6px',
      width: '100%',
      padding: `${ctx.spacing['2.5'] ?? '10px'} ${ctx.spacing['3'] ?? '12px'}`,
      fontSize: '14px',
      lineHeight: '1.5',
      borderRadius: ctx.radii.md,
      border: `1px solid ${ctx.colors.border}`,
      backgroundColor: ctx.colors.background,
      color: ctx.colors.text,
    };
  }

  private resolveCheckboxStyle(ctx: TokenContext): ResolvedStyle {
    return {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: ctx.spacing['2'] ?? '8px',
      fontSize: '14px',
      color: ctx.colors.text,
      cursor: 'pointer',
    };
  }

  private resolveSearchBarStyle(ctx: TokenContext): ResolvedStyle {
    return {
      display: 'flex',
      alignItems: 'center',
      gap: ctx.spacing['2'] ?? '8px',
      padding: `${ctx.spacing['2.5'] ?? '10px'} ${ctx.spacing['4'] ?? '16px'}`,
      borderRadius: ctx.radii.full,
      border: `1px solid ${ctx.colors.border}`,
      backgroundColor: ctx.colors.surface,
      fontSize: '14px',
      width: '100%',
    };
  }

  private resolveImageStyle(comp: WireframeComponent, ctx: TokenContext): ResolvedStyle {
    const size = (comp.props?.size as string) ?? 'md';
    const dims = IMAGE_SIZE_MAP[size] ?? IMAGE_SIZE_MAP.md;
    return {
      width: dims.width,
      height: dims.height,
      borderRadius: ctx.radii.lg,
      backgroundColor: ctx.colors.surface,
      overflow: 'hidden',
    };
  }

  private resolveAvatarStyle(comp: WireframeComponent, ctx: TokenContext): ResolvedStyle {
    const size = (comp.props?.size as string) ?? 'md';
    const dim = AVATAR_SIZE_MAP[size] ?? AVATAR_SIZE_MAP.md;
    const shape = (comp.props?.shape as string) ?? 'circle';
    return {
      width: dim,
      height: dim,
      borderRadius: shape === 'circle' ? ctx.radii.full : ctx.radii.md,
      backgroundColor: ctx.colors.primaryLight,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: ctx.colors.primary,
      fontWeight: '600',
      fontSize: size === 'lg' ? '24px' : size === 'sm' ? '12px' : '16px',
      overflow: 'hidden',
    };
  }

  private resolveVideoStyle(ctx: TokenContext): ResolvedStyle {
    return {
      width: '100%',
      borderRadius: ctx.radii.lg,
      backgroundColor: ctx.colors.neutral900 ?? '#0F172A',
      minHeight: '320px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
    };
  }

  private resolveCardStyle(comp: WireframeComponent, ctx: TokenContext): ResolvedStyle {
    const variant = (comp.props?.variant as string) ?? 'default';
    const base: ResolvedStyle = {
      display: 'flex',
      flexDirection: 'column',
      gap: ctx.spacing['3'] ?? '12px',
      padding: ctx.spacing['5'] ?? '20px',
      borderRadius: ctx.radii.lg,
      overflow: 'hidden',
    };

    const variantStyles: Record<string, Partial<ResolvedStyle>> = {
      default: { backgroundColor: ctx.colors.surface, border: `1px solid ${ctx.colors.border}` },
      elevated: { backgroundColor: ctx.colors.surfaceElevated, boxShadow: ctx.shadows.lg },
      primary: { backgroundColor: ctx.colors.primaryLight, border: `1px solid ${ctx.colors.primary}20` },
      outline: { backgroundColor: 'transparent', border: `1px solid ${ctx.colors.border}` },
      ghost: { backgroundColor: 'transparent' },
      success: { backgroundColor: ctx.colors.successLight, border: `1px solid ${ctx.colors.success}30` },
    };

    return { ...base, ...(variantStyles[variant] ?? variantStyles.default) };
  }

  private resolveTableStyle(ctx: TokenContext): ResolvedStyle {
    return {
      width: '100%',
      borderRadius: ctx.radii.lg,
      border: `1px solid ${ctx.colors.border}`,
      overflow: 'hidden',
      backgroundColor: ctx.colors.background,
      fontSize: '14px',
    };
  }

  private resolveStatsStyle(ctx: TokenContext): ResolvedStyle {
    return {
      display: 'flex',
      flexDirection: 'column',
      gap: ctx.spacing['1'] ?? '4px',
      padding: ctx.spacing['5'] ?? '20px',
      backgroundColor: ctx.colors.surface,
      borderRadius: ctx.radii.lg,
      border: `1px solid ${ctx.colors.border}`,
    };
  }

  private resolveChartStyle(comp: WireframeComponent, ctx: TokenContext): ResolvedStyle {
    const height = (comp.props?.height as string) ?? 'md';
    return {
      width: '100%',
      minHeight: CHART_HEIGHT_MAP[height] ?? CHART_HEIGHT_MAP.md,
      borderRadius: ctx.radii.lg,
      backgroundColor: ctx.colors.surface,
      border: `1px solid ${ctx.colors.border}`,
      padding: ctx.spacing['4'] ?? '16px',
    };
  }

  private resolveListStyle(comp: WireframeComponent, ctx: TokenContext): ResolvedStyle {
    const columns = (comp.props?.columns as number) ?? 1;
    if (columns > 1) {
      return {
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: ctx.spacing['4'] ?? '16px',
      };
    }
    return {
      display: 'flex',
      flexDirection: 'column',
      gap: ctx.spacing['3'] ?? '12px',
    };
  }

  private resolveStepperStyle(ctx: TokenContext): ResolvedStyle {
    return {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: ctx.spacing['2'] ?? '8px',
      padding: `${ctx.spacing['4'] ?? '16px'} 0`,
    };
  }

  private resolveProgressBarStyle(comp: WireframeComponent, ctx: TokenContext): ResolvedStyle {
    return {
      width: '100%',
      height: '8px',
      borderRadius: ctx.radii.full,
      backgroundColor: ctx.colors.borderLight,
      overflow: 'hidden',
    };
  }

  private resolveHeroStyle(comp: WireframeComponent, ctx: TokenContext): ResolvedStyle {
    const alignment = (comp.props?.alignment as string) ?? 'center';
    return {
      display: 'flex',
      flexDirection: 'column',
      alignItems: alignment === 'center' ? 'center' : 'flex-start',
      textAlign: alignment === 'center' ? 'center' : 'left',
      gap: ctx.spacing['6'] ?? '24px',
      padding: `${ctx.spacing['16'] ?? '64px'} ${ctx.spacing['6'] ?? '24px'}`,
      width: '100%',
    };
  }

  private resolvePricingStyle(comp: WireframeComponent, ctx: TokenContext): ResolvedStyle {
    const featured = comp.props?.featured as boolean;
    return {
      display: 'flex',
      flexDirection: 'column',
      gap: ctx.spacing['4'] ?? '16px',
      padding: ctx.spacing['6'] ?? '24px',
      borderRadius: ctx.radii.xl,
      backgroundColor: featured ? ctx.colors.primary : ctx.colors.surface,
      color: featured ? ctx.colors.textOnPrimary : ctx.colors.text,
      border: featured ? 'none' : `1px solid ${ctx.colors.border}`,
      boxShadow: featured ? ctx.shadows.xl : ctx.shadows.sm,
    };
  }

  // ─── Token Resolution ───

  private resolveColors(ds?: WireframeDesignSystem): Record<string, string> {
    if (!ds?.colorPalette) return { ...DEFAULT_COLORS };
    return { ...DEFAULT_COLORS, ...ds.colorPalette };
  }

  private resolveTypography(
    ds?: WireframeDesignSystem,
  ): Record<string, { size: string; lineHeight: string; weight: string; letterSpacing: string }> {
    if (!ds?.typography) return { ...DEFAULT_TYPOGRAPHY };
    const scale = (ds.typography as Record<string, unknown>).scale as
      | Record<string, { size: string; lineHeight: string; weight: string; letterSpacing: string }>
      | undefined;
    if (!scale) return { ...DEFAULT_TYPOGRAPHY };
    return { ...DEFAULT_TYPOGRAPHY, ...scale };
  }

  private resolveSpacing(ds?: WireframeDesignSystem): Record<string, string> {
    if (!ds?.spacing) return { ...DEFAULT_SPACING };
    const scale = (ds.spacing as Record<string, unknown>).scale as
      | Record<string, string>
      | undefined;
    if (!scale) return { ...DEFAULT_SPACING };
    return { ...DEFAULT_SPACING, ...scale };
  }

  private resolveShadows(ds?: WireframeDesignSystem): Record<string, string> {
    if (!ds?.shadows) return { ...DEFAULT_SHADOWS };
    return { ...DEFAULT_SHADOWS, ...ds.shadows };
  }

  private resolveRadii(ds?: WireframeDesignSystem): Record<string, string> {
    if (!ds?.spacing) return { ...DEFAULT_RADII };
    const radii = (ds.spacing as Record<string, unknown>).borderRadius as
      | Record<string, string>
      | undefined;
    if (!radii) return { ...DEFAULT_RADII };
    return { ...DEFAULT_RADII, ...radii };
  }

  private resolveFont(ctx: TokenContext): string {
    const typo = ctx.typography as Record<string, unknown>;
    return (typo as { fontFamily?: string }).fontFamily ?? 'Inter, system-ui, sans-serif';
  }

  private resolveHeadingFont(ctx: TokenContext): string {
    const typo = ctx.typography as Record<string, unknown>;
    return (typo as { headingFont?: string }).headingFont ?? this.resolveFont(ctx);
  }
}

// ─── Internal Context Type ───

type TokenContext = {
  colors: Record<string, string>;
  typography: Record<string, { size: string; lineHeight: string; weight: string; letterSpacing: string }>;
  spacing: Record<string, string>;
  shadows: Record<string, string>;
  radii: Record<string, string>;
};
