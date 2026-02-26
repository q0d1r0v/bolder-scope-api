import { Injectable, Logger } from '@nestjs/common';
import type {
  WireframeComponent,
  WireframeDesignSystem,
  WireframeScreenData,
  WireframeSection,
} from '@/modules/ai/services/ai.service';

// ─── Validation Types ───

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationIssue = {
  severity: ValidationSeverity;
  path: string;
  message: string;
  code: string;
  fix?: string;
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
  stats: {
    totalScreens: number;
    totalSections: number;
    totalComponents: number;
    maxDepth: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
};

// ─── Constants ───

const VALID_COMPONENT_TYPES = new Set([
  'nav', 'sidebar', 'footer', 'breadcrumb',
  'heading', 'text', 'badge', 'icon',
  'input', 'select', 'checkbox', 'toggle', 'slider', 'searchBar', 'fileUpload', 'form',
  'button', 'link',
  'image', 'avatar', 'video',
  'card', 'table', 'list', 'stats', 'chart', 'timeline',
  'tab', 'accordion', 'stepper', 'pagination', 'progressBar',
  'divider', 'skeleton', 'hero', 'pricing', 'testimonial', 'map',
]);

const VALID_LAYOUTS = new Set([
  'row', 'column', 'grid', 'stack', 'sidebar-left', 'sidebar-right', 'split',
]);

const VALID_PADDINGS = new Set(['none', 'sm', 'md', 'lg', 'xl']);

const VALID_BUTTON_VARIANTS = new Set([
  'primary', 'secondary', 'outline', 'ghost', 'destructive',
]);

const VALID_BUTTON_SIZES = new Set(['sm', 'md', 'lg']);

const VALID_HEADING_SIZES = new Set(['sm', 'md', 'lg', 'xl', 'display']);

const VALID_CARD_VARIANTS = new Set([
  'default', 'primary', 'outline', 'ghost', 'success', 'elevated',
]);

const VALID_BADGE_VARIANTS = new Set([
  'default', 'success', 'error', 'warning', 'info', 'primary', 'outline',
]);

const VALID_IMAGE_SIZES = new Set(['sm', 'md', 'lg', 'hero']);

const VALID_NAV_VARIANTS = new Set(['primary', 'default', 'vertical', 'transparent']);

const VALID_WIDTH_VALUES = new Set([
  'full', '1/2', '1/3', '2/3', '1/4', '3/4', 'auto',
]);

const CONTAINER_TYPES = new Set([
  'nav', 'sidebar', 'footer', 'form', 'card', 'list', 'tab',
  'accordion', 'hero', 'pricing', 'testimonial', 'timeline',
]);

const MAX_COMPONENT_DEPTH = 8;

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const REQUIRED_COLOR_KEYS = [
  'primary', 'secondary', 'background', 'surface', 'text',
  'textSecondary', 'border', 'error', 'success', 'warning', 'info',
];

const REQUIRED_TYPOGRAPHY_KEYS = ['fontFamily', 'scale'];

const REQUIRED_SPACING_KEYS = ['unit', 'scale'];

@Injectable()
export class WireframeValidatorService {
  private readonly logger = new Logger(WireframeValidatorService.name);

  // ─── Main Validation Entry Point ───

  validateScreens(
    screens: WireframeScreenData[],
    designSystem?: WireframeDesignSystem,
  ): ValidationResult {
    const issues: ValidationIssue[] = [];
    let totalSections = 0;
    let totalComponents = 0;
    let maxDepth = 0;

    if (!screens || screens.length === 0) {
      issues.push({
        severity: 'error',
        path: 'screens',
        message: 'At least one screen is required',
        code: 'EMPTY_SCREENS',
      });

      return {
        valid: false,
        issues,
        stats: {
          totalScreens: 0,
          totalSections: 0,
          totalComponents: 0,
          maxDepth: 0,
          errorCount: 1,
          warningCount: 0,
          infoCount: 0,
        },
      };
    }

    // Validate each screen
    const screenNames = new Set<string>();

    for (const [screenIdx, screen] of screens.entries()) {
      const screenPath = `screens[${screenIdx}]`;

      // Screen name
      if (!screen.screenName || screen.screenName.trim() === '') {
        issues.push({
          severity: 'error',
          path: `${screenPath}.screenName`,
          message: 'Screen must have a name',
          code: 'MISSING_SCREEN_NAME',
        });
      } else if (screenNames.has(screen.screenName)) {
        issues.push({
          severity: 'warning',
          path: `${screenPath}.screenName`,
          message: `Duplicate screen name: "${screen.screenName}"`,
          code: 'DUPLICATE_SCREEN_NAME',
        });
      } else {
        screenNames.add(screen.screenName);
      }

      // Title
      if (!screen.title || screen.title.trim() === '') {
        issues.push({
          severity: 'warning',
          path: `${screenPath}.title`,
          message: 'Screen should have a title',
          code: 'MISSING_SCREEN_TITLE',
          fix: 'Auto-generated from screenName',
        });
      }

      // Sections
      if (!screen.sections || screen.sections.length === 0) {
        issues.push({
          severity: 'error',
          path: `${screenPath}.sections`,
          message: `Screen "${screen.screenName}" has no sections`,
          code: 'EMPTY_SECTIONS',
        });
      } else {
        totalSections += screen.sections.length;

        for (const [secIdx, section] of screen.sections.entries()) {
          const secPath = `${screenPath}.sections[${secIdx}]`;
          const { componentCount, depth } = this.validateSection(
            section,
            secPath,
            issues,
          );
          totalComponents += componentCount;
          maxDepth = Math.max(maxDepth, depth);
        }
      }

      // Visual hierarchy checks
      this.validateVisualHierarchy(screen, screenPath, issues);
    }

    // Validate design system if provided
    if (designSystem) {
      this.validateDesignSystem(designSystem, issues);
    }

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;
    const infoCount = issues.filter((i) => i.severity === 'info').length;

    return {
      valid: errorCount === 0,
      issues,
      stats: {
        totalScreens: screens.length,
        totalSections,
        totalComponents,
        maxDepth,
        errorCount,
        warningCount,
        infoCount,
      },
    };
  }

  // ─── Section Validation ───

  private validateSection(
    section: WireframeSection,
    path: string,
    issues: ValidationIssue[],
  ): { componentCount: number; depth: number } {
    let componentCount = 0;
    let maxDepth = 0;

    if (!section.name || section.name.trim() === '') {
      issues.push({
        severity: 'warning',
        path: `${path}.name`,
        message: 'Section should have a name',
        code: 'MISSING_SECTION_NAME',
      });
    }

    if (!section.layout) {
      issues.push({
        severity: 'error',
        path: `${path}.layout`,
        message: 'Section must have a layout type',
        code: 'MISSING_LAYOUT',
      });
    } else if (!VALID_LAYOUTS.has(section.layout)) {
      issues.push({
        severity: 'warning',
        path: `${path}.layout`,
        message: `Unknown layout type: "${section.layout}". Expected: ${[...VALID_LAYOUTS].join(', ')}`,
        code: 'INVALID_LAYOUT',
        fix: 'Defaulting to "column"',
      });
    }

    if (
      section.padding !== undefined
      && section.padding !== null
      && !VALID_PADDINGS.has(section.padding)
    ) {
      issues.push({
        severity: 'warning',
        path: `${path}.padding`,
        message: `Unknown padding value: "${section.padding}"`,
        code: 'INVALID_PADDING',
      });
    }

    if (
      section.background
      && section.background !== 'gradient'
      && !HEX_COLOR_REGEX.test(section.background)
    ) {
      issues.push({
        severity: 'info',
        path: `${path}.background`,
        message: `Non-standard background value: "${section.background}"`,
        code: 'NON_STANDARD_BACKGROUND',
      });
    }

    if (!section.components || section.components.length === 0) {
      issues.push({
        severity: 'warning',
        path: `${path}.components`,
        message: `Section "${section.name}" has no components`,
        code: 'EMPTY_COMPONENTS',
      });
    } else {
      for (const [compIdx, comp] of section.components.entries()) {
        const compPath = `${path}.components[${compIdx}]`;
        const { count, depth } = this.validateComponent(comp, compPath, issues, 1);
        componentCount += count;
        maxDepth = Math.max(maxDepth, depth);
      }
    }

    return { componentCount, depth: maxDepth };
  }

  // ─── Component Validation (Recursive) ───

  private validateComponent(
    component: WireframeComponent,
    path: string,
    issues: ValidationIssue[],
    depth: number,
  ): { count: number; depth: number } {
    let count = 1;
    let maxDepth = depth;

    // Depth check
    if (depth > MAX_COMPONENT_DEPTH) {
      issues.push({
        severity: 'error',
        path,
        message: `Component nesting exceeds maximum depth of ${MAX_COMPONENT_DEPTH}`,
        code: 'MAX_DEPTH_EXCEEDED',
      });
      return { count, depth };
    }

    // Type check
    if (!component.type) {
      issues.push({
        severity: 'error',
        path: `${path}.type`,
        message: 'Component must have a type',
        code: 'MISSING_COMPONENT_TYPE',
      });
    } else if (!VALID_COMPONENT_TYPES.has(component.type)) {
      issues.push({
        severity: 'warning',
        path: `${path}.type`,
        message: `Unknown component type: "${component.type}"`,
        code: 'UNKNOWN_COMPONENT_TYPE',
      });
    }

    // Props validation for known types
    if (component.type && component.props) {
      this.validateComponentProps(component, path, issues);
    }

    // Width prop validation
    if (component.props?.width && !VALID_WIDTH_VALUES.has(component.props.width as string)) {
      issues.push({
        severity: 'warning',
        path: `${path}.props.width`,
        message: `Invalid width value: "${component.props.width}"`,
        code: 'INVALID_WIDTH',
      });
    }

    // Label check for interactive / display components
    const needsLabel = new Set([
      'button', 'input', 'select', 'heading', 'text', 'link',
      'checkbox', 'toggle', 'searchBar', 'image',
    ]);
    if (needsLabel.has(component.type) && !component.label) {
      issues.push({
        severity: 'warning',
        path: `${path}.label`,
        message: `${component.type} component should have a label`,
        code: 'MISSING_LABEL',
      });
    }

    // Lorem ipsum check
    if (component.label && /lorem\s+ipsum/i.test(component.label)) {
      issues.push({
        severity: 'warning',
        path: `${path}.label`,
        message: 'Found "Lorem ipsum" placeholder. Use realistic content instead.',
        code: 'LOREM_IPSUM_DETECTED',
      });
    }

    // Children validation for container types
    if (component.children && component.children.length > 0) {
      if (!CONTAINER_TYPES.has(component.type)) {
        issues.push({
          severity: 'info',
          path: `${path}.children`,
          message: `Component type "${component.type}" has children but is not a recognized container`,
          code: 'UNEXPECTED_CHILDREN',
        });
      }

      for (const [childIdx, child] of component.children.entries()) {
        const childPath = `${path}.children[${childIdx}]`;
        const result = this.validateComponent(child, childPath, issues, depth + 1);
        count += result.count;
        maxDepth = Math.max(maxDepth, result.depth);
      }
    }

    return { count, depth: maxDepth };
  }

  // ─── Component Prop Validators ───

  private validateComponentProps(
    component: WireframeComponent,
    path: string,
    issues: ValidationIssue[],
  ) {
    const { type, props } = component;
    if (!props) return;

    switch (type) {
      case 'button':
        if (props.variant && !VALID_BUTTON_VARIANTS.has(props.variant as string)) {
          issues.push({
            severity: 'warning',
            path: `${path}.props.variant`,
            message: `Invalid button variant: "${props.variant}"`,
            code: 'INVALID_BUTTON_VARIANT',
          });
        }
        if (props.size && !VALID_BUTTON_SIZES.has(props.size as string)) {
          issues.push({
            severity: 'warning',
            path: `${path}.props.size`,
            message: `Invalid button size: "${props.size}"`,
            code: 'INVALID_BUTTON_SIZE',
          });
        }
        break;

      case 'heading':
        if (props.size && !VALID_HEADING_SIZES.has(props.size as string)) {
          issues.push({
            severity: 'warning',
            path: `${path}.props.size`,
            message: `Invalid heading size: "${props.size}"`,
            code: 'INVALID_HEADING_SIZE',
          });
        }
        break;

      case 'card':
        if (props.variant && !VALID_CARD_VARIANTS.has(props.variant as string)) {
          issues.push({
            severity: 'warning',
            path: `${path}.props.variant`,
            message: `Invalid card variant: "${props.variant}"`,
            code: 'INVALID_CARD_VARIANT',
          });
        }
        break;

      case 'badge':
        if (props.variant && !VALID_BADGE_VARIANTS.has(props.variant as string)) {
          issues.push({
            severity: 'warning',
            path: `${path}.props.variant`,
            message: `Invalid badge variant: "${props.variant}"`,
            code: 'INVALID_BADGE_VARIANT',
          });
        }
        break;

      case 'image':
        if (props.size && !VALID_IMAGE_SIZES.has(props.size as string)) {
          issues.push({
            severity: 'warning',
            path: `${path}.props.size`,
            message: `Invalid image size: "${props.size}"`,
            code: 'INVALID_IMAGE_SIZE',
          });
        }
        break;

      case 'nav':
        if (props.variant && !VALID_NAV_VARIANTS.has(props.variant as string)) {
          issues.push({
            severity: 'warning',
            path: `${path}.props.variant`,
            message: `Invalid nav variant: "${props.variant}"`,
            code: 'INVALID_NAV_VARIANT',
          });
        }
        break;

      case 'progressBar':
        if (props.value !== undefined) {
          const val = Number(props.value);
          if (isNaN(val) || val < 0 || val > 100) {
            issues.push({
              severity: 'warning',
              path: `${path}.props.value`,
              message: 'Progress bar value should be between 0 and 100',
              code: 'INVALID_PROGRESS_VALUE',
            });
          }
        }
        break;

      case 'slider':
        if (props.min !== undefined && props.max !== undefined) {
          if (Number(props.min) >= Number(props.max)) {
            issues.push({
              severity: 'error',
              path: `${path}.props`,
              message: 'Slider min must be less than max',
              code: 'INVALID_SLIDER_RANGE',
            });
          }
        }
        break;
    }
  }

  // ─── Visual Hierarchy Validation ───

  private validateVisualHierarchy(
    screen: WireframeScreenData,
    path: string,
    issues: ValidationIssue[],
  ) {
    const allComponents = this.flattenComponents(screen.sections);

    // Check for primary heading
    const headings = allComponents.filter((c) => c.type === 'heading');
    const hasLargeHeading = headings.some(
      (h) => h.props?.size === 'xl' || h.props?.size === 'display',
    );
    if (headings.length > 0 && !hasLargeHeading) {
      issues.push({
        severity: 'info',
        path,
        message: `Screen "${screen.screenName}" has no primary heading (xl/display size)`,
        code: 'NO_PRIMARY_HEADING',
      });
    }

    // Check CTA density
    const primaryButtons = allComponents.filter(
      (c) => c.type === 'button' && c.props?.variant === 'primary',
    );
    if (primaryButtons.length > 3) {
      issues.push({
        severity: 'warning',
        path,
        message: `Screen "${screen.screenName}" has ${primaryButtons.length} primary buttons (max 3 recommended)`,
        code: 'EXCESSIVE_PRIMARY_BUTTONS',
      });
    }

    // Check nav item density
    const navComponents = allComponents.filter((c) => c.type === 'nav');
    for (const nav of navComponents) {
      const navItems = (nav.props?.items as string[]) ?? [];
      const navChildren = nav.children?.filter(
        (c) => c.type === 'link' || c.type === 'button',
      ) ?? [];
      const totalItems = navItems.length + navChildren.length;
      if (totalItems > 6) {
        issues.push({
          severity: 'warning',
          path,
          message: `Navigation has ${totalItems} items (max 6 recommended)`,
          code: 'EXCESSIVE_NAV_ITEMS',
        });
      }
    }

    // Accessibility: inputs without labels
    const inputs = allComponents.filter((c) => c.type === 'input' || c.type === 'select');
    for (const input of inputs) {
      if (!input.label) {
        issues.push({
          severity: 'warning',
          path,
          message: `Form input missing label in screen "${screen.screenName}"`,
          code: 'INPUT_MISSING_LABEL',
        });
      }
    }
  }

  // ─── Design System Validation ───

  private validateDesignSystem(
    ds: WireframeDesignSystem,
    issues: ValidationIssue[],
  ) {
    const dsPath = 'designSystem';

    // Color palette
    if (!ds.colorPalette || Object.keys(ds.colorPalette).length === 0) {
      issues.push({
        severity: 'error',
        path: `${dsPath}.colorPalette`,
        message: 'Design system must have a color palette',
        code: 'MISSING_COLOR_PALETTE',
      });
    } else {
      for (const key of REQUIRED_COLOR_KEYS) {
        if (!ds.colorPalette[key]) {
          issues.push({
            severity: 'warning',
            path: `${dsPath}.colorPalette.${key}`,
            message: `Missing required color: "${key}"`,
            code: 'MISSING_REQUIRED_COLOR',
          });
        }
      }

      for (const [key, value] of Object.entries(ds.colorPalette)) {
        if (
          typeof value === 'string'
          && !value.startsWith('linear-gradient')
          && !value.startsWith('radial-gradient')
          && !HEX_COLOR_REGEX.test(value)
        ) {
          issues.push({
            severity: 'info',
            path: `${dsPath}.colorPalette.${key}`,
            message: `Non-standard color format for "${key}": "${value}"`,
            code: 'NON_HEX_COLOR',
          });
        }
      }
    }

    // Typography
    if (!ds.typography) {
      issues.push({
        severity: 'warning',
        path: `${dsPath}.typography`,
        message: 'Design system should include typography settings',
        code: 'MISSING_TYPOGRAPHY',
      });
    } else {
      for (const key of REQUIRED_TYPOGRAPHY_KEYS) {
        if (!(key in ds.typography)) {
          issues.push({
            severity: 'warning',
            path: `${dsPath}.typography.${key}`,
            message: `Missing typography setting: "${key}"`,
            code: 'MISSING_TYPOGRAPHY_KEY',
          });
        }
      }
    }

    // Spacing
    if (!ds.spacing) {
      issues.push({
        severity: 'warning',
        path: `${dsPath}.spacing`,
        message: 'Design system should include spacing settings',
        code: 'MISSING_SPACING',
      });
    } else {
      for (const key of REQUIRED_SPACING_KEYS) {
        if (!(key in ds.spacing)) {
          issues.push({
            severity: 'warning',
            path: `${dsPath}.spacing.${key}`,
            message: `Missing spacing setting: "${key}"`,
            code: 'MISSING_SPACING_KEY',
          });
        }
      }
    }
  }

  // ─── Auto-Fix ───

  autoFix(screens: WireframeScreenData[]): WireframeScreenData[] {
    return screens.map((screen) => ({
      ...screen,
      title: screen.title || screen.screenName,
      screenType: screen.screenType || 'page',
      sections: screen.sections.map((section) => ({
        ...section,
        layout: VALID_LAYOUTS.has(section.layout) ? section.layout : 'column',
        components: this.autoFixComponents(section.components),
      })),
    }));
  }

  private autoFixComponents(
    components: WireframeComponent[],
  ): WireframeComponent[] {
    return components.map((comp) => {
      const fixed: WireframeComponent = { ...comp };

      // Normalize type casing
      if (fixed.type) {
        const lowerType = fixed.type.toLowerCase();
        const typeMap: Record<string, string> = {
          'search-bar': 'searchBar',
          'search_bar': 'searchBar',
          'file-upload': 'fileUpload',
          'file_upload': 'fileUpload',
          'progress-bar': 'progressBar',
          'progress_bar': 'progressBar',
        };
        if (typeMap[lowerType]) {
          fixed.type = typeMap[lowerType];
        }
      }

      // Ensure props object exists
      if (!fixed.props) {
        fixed.props = {};
      }

      // Default variant/size for buttons
      if (fixed.type === 'button') {
        fixed.props.variant = fixed.props.variant ?? 'primary';
        fixed.props.size = fixed.props.size ?? 'md';
      }

      // Default heading size
      if (fixed.type === 'heading') {
        fixed.props.size = fixed.props.size ?? 'md';
      }

      // Recursively fix children
      if (fixed.children && fixed.children.length > 0) {
        fixed.children = this.autoFixComponents(fixed.children);
      }

      return fixed;
    });
  }

  // ─── Helpers ───

  private flattenComponents(sections: WireframeSection[]): WireframeComponent[] {
    const result: WireframeComponent[] = [];
    const stack: WireframeComponent[] = [];

    for (const section of sections) {
      if (section.components) {
        stack.push(...section.components);
      }
    }

    while (stack.length > 0) {
      const comp = stack.pop()!;
      result.push(comp);
      if (comp.children) {
        stack.push(...comp.children);
      }
    }

    return result;
  }
}
