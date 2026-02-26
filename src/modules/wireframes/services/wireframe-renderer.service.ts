import { Injectable, Logger } from '@nestjs/common';
import type {
  BeautifiedComponent,
  BeautifiedScreen,
  BeautifiedSection,
  ResolvedStyle,
} from './wireframe-beautifier.service';

// ─── Render Output Types ───

export type RenderedScreen = {
  screenName: string;
  width: number;
  height: number;
  format: 'png';
  buffer: Buffer;
};

export type RenderResult = {
  screens: RenderedScreen[];
  totalScreens: number;
};

// ─── Canvas Drawing Constants ───

const COMPONENT_MIN_HEIGHT: Record<string, number> = {
  nav: 56,
  sidebar: 600,
  footer: 160,
  breadcrumb: 32,
  heading: 40,
  text: 24,
  badge: 24,
  icon: 24,
  input: 56,
  select: 56,
  checkbox: 32,
  toggle: 32,
  slider: 40,
  searchBar: 48,
  fileUpload: 120,
  form: 200,
  button: 40,
  link: 24,
  image: 240,
  avatar: 48,
  video: 320,
  card: 160,
  table: 200,
  list: 120,
  stats: 100,
  chart: 280,
  timeline: 200,
  tab: 48,
  accordion: 120,
  stepper: 48,
  pagination: 40,
  progressBar: 8,
  divider: 1,
  skeleton: 80,
  hero: 360,
  pricing: 340,
  testimonial: 160,
  map: 280,
};

const IMAGE_SIZE_HEIGHTS: Record<string, number> = {
  sm: 120, md: 240, lg: 400, hero: 560,
};

const AVATAR_SIZES: Record<string, number> = {
  sm: 32, md: 48, lg: 80,
};

const CHART_HEIGHTS: Record<string, number> = {
  sm: 200, md: 320, lg: 480,
};

@Injectable()
export class WireframeRendererService {
  private readonly logger = new Logger(WireframeRendererService.name);

  // ─── Main Render Entry Point ───

  async renderScreens(
    screens: BeautifiedScreen[],
    viewportWidth = 1440,
  ): Promise<RenderResult> {
    const rendered: RenderedScreen[] = [];

    for (const screen of screens) {
      const buffer = await this.renderScreen(screen, viewportWidth);
      rendered.push({
        screenName: screen.screenName,
        width: viewportWidth,
        height: this.estimateScreenHeight(screen, viewportWidth),
        format: 'png',
        buffer,
      });
    }

    return {
      screens: rendered,
      totalScreens: rendered.length,
    };
  }

  // ─── Single Screen Render ───

  private async renderScreen(
    screen: BeautifiedScreen,
    viewportWidth: number,
  ): Promise<Buffer> {
    const height = this.estimateScreenHeight(screen, viewportWidth);
    const PDFDocument = (await import('pdfkit')).default;

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: [viewportWidth, height],
        margin: 0,
        info: { Title: screen.screenName },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Draw screen background
      const bgColor = screen.style.backgroundColor ?? '#FFFFFF';
      doc.rect(0, 0, viewportWidth, height).fill(bgColor);

      let y = 0;

      for (const section of screen.sections) {
        const sectionHeight = this.estimateSectionHeight(section, viewportWidth);
        this.drawSection(doc, section, 0, y, viewportWidth, sectionHeight);
        y += sectionHeight;
      }

      doc.end();
    });
  }

  // ─── Section Drawing ───

  private drawSection(
    doc: PDFKit.PDFDocument,
    section: BeautifiedSection,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    // Section background
    const bgColor = section.style.backgroundColor ?? section.style.background;
    if (bgColor && !bgColor.includes('gradient') && !bgColor.includes('transparent')) {
      doc.rect(x, y, width, height).fill(this.safeColor(bgColor));
    }

    const padding = this.parsePx(section.style.padding ?? '24');
    const innerX = x + padding;
    const innerY = y + padding;
    const innerWidth = width - padding * 2;

    const layout = section.layout;
    let currentY = innerY;
    let currentX = innerX;
    const gap = this.parsePx(section.style.gap ?? '16');

    if (layout === 'row' || layout === 'split') {
      const colCount = section.components.length || 1;
      const colWidth = (innerWidth - gap * (colCount - 1)) / colCount;

      for (const [i, comp] of section.components.entries()) {
        const compX = innerX + i * (colWidth + gap);
        const compHeight = this.estimateComponentHeight(comp, colWidth);
        this.drawComponent(doc, comp, compX, innerY, colWidth, compHeight);
      }
    } else if (layout === 'grid') {
      const cols = this.getGridCols(section, innerWidth);
      const colWidth = (innerWidth - gap * (cols - 1)) / cols;
      let row = 0;
      let col = 0;

      for (const comp of section.components) {
        const compX = innerX + col * (colWidth + gap);
        const compY = currentY + row * (this.estimateComponentHeight(comp, colWidth) + gap);
        const compHeight = this.estimateComponentHeight(comp, colWidth);
        this.drawComponent(doc, comp, compX, compY, colWidth, compHeight);

        col++;
        if (col >= cols) {
          col = 0;
          row++;
        }
      }
    } else if (layout === 'sidebar-left') {
      const sidebarWidth = 280;
      const contentWidth = innerWidth - sidebarWidth - gap;

      if (section.components.length > 0) {
        const sideH = this.estimateComponentHeight(section.components[0], sidebarWidth);
        this.drawComponent(doc, section.components[0], innerX, innerY, sidebarWidth, sideH);
      }

      let contentY = innerY;
      for (let i = 1; i < section.components.length; i++) {
        const comp = section.components[i];
        const compH = this.estimateComponentHeight(comp, contentWidth);
        this.drawComponent(doc, comp, innerX + sidebarWidth + gap, contentY, contentWidth, compH);
        contentY += compH + gap;
      }
    } else if (layout === 'sidebar-right') {
      const sidebarWidth = 280;
      const contentWidth = innerWidth - sidebarWidth - gap;

      let contentY = innerY;
      for (let i = 0; i < section.components.length - 1; i++) {
        const comp = section.components[i];
        const compH = this.estimateComponentHeight(comp, contentWidth);
        this.drawComponent(doc, comp, innerX, contentY, contentWidth, compH);
        contentY += compH + gap;
      }

      if (section.components.length > 0) {
        const lastComp = section.components[section.components.length - 1];
        const sideH = this.estimateComponentHeight(lastComp, sidebarWidth);
        this.drawComponent(doc, lastComp, innerX + contentWidth + gap, innerY, sidebarWidth, sideH);
      }
    } else {
      // column / stack
      for (const comp of section.components) {
        const compHeight = this.estimateComponentHeight(comp, innerWidth);
        this.drawComponent(doc, comp, currentX, currentY, innerWidth, compHeight);
        currentY += compHeight + gap;
      }
    }
  }

  // ─── Component Drawing ───

  private drawComponent(
    doc: PDFKit.PDFDocument,
    comp: BeautifiedComponent,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    const s = comp.style;
    const radius = this.parsePx(s.borderRadius ?? '0');
    const safeRadius = Math.min(radius, height / 2, width / 2);

    // Background
    const bgColor = s.backgroundColor;
    if (bgColor && bgColor !== 'transparent') {
      this.drawRoundedRect(doc, x, y, width, height, safeRadius);
      doc.fill(this.safeColor(bgColor));
    }

    // Border
    if (s.border) {
      const borderColor = this.extractBorderColor(s.border);
      if (borderColor) {
        this.drawRoundedRect(doc, x, y, width, height, safeRadius);
        doc.strokeColor(this.safeColor(borderColor)).lineWidth(1).stroke();
      }
    } else if (s.borderColor) {
      this.drawRoundedRect(doc, x, y, width, height, safeRadius);
      doc.strokeColor(this.safeColor(s.borderColor)).lineWidth(1).stroke();
    }

    // Component-specific rendering
    switch (comp.type) {
      case 'heading':
        this.drawHeading(doc, comp, x, y, width, height);
        break;
      case 'text':
        this.drawText(doc, comp, x, y, width, height);
        break;
      case 'button':
        this.drawButton(doc, comp, x, y, width, height);
        break;
      case 'input':
      case 'select':
        this.drawInput(doc, comp, x, y, width, height);
        break;
      case 'image':
        this.drawImagePlaceholder(doc, comp, x, y, width, height);
        break;
      case 'avatar':
        this.drawAvatar(doc, comp, x, y, height);
        break;
      case 'card':
        this.drawCardContent(doc, comp, x, y, width, height);
        break;
      case 'nav':
        this.drawNav(doc, comp, x, y, width, height);
        break;
      case 'badge':
        this.drawBadge(doc, comp, x, y, width, height);
        break;
      case 'stats':
        this.drawStats(doc, comp, x, y, width, height);
        break;
      case 'chart':
        this.drawChart(doc, comp, x, y, width, height);
        break;
      case 'table':
        this.drawTable(doc, comp, x, y, width, height);
        break;
      case 'progressBar':
        this.drawProgressBar(doc, comp, x, y, width, height);
        break;
      case 'divider':
        this.drawDivider(doc, comp, x, y, width);
        break;
      case 'searchBar':
        this.drawSearchBar(doc, comp, x, y, width, height);
        break;
      case 'hero':
        this.drawHero(doc, comp, x, y, width, height);
        break;
      case 'footer':
        this.drawFooter(doc, comp, x, y, width, height);
        break;
      case 'stepper':
        this.drawStepper(doc, comp, x, y, width, height);
        break;
      case 'breadcrumb':
        this.drawBreadcrumb(doc, comp, x, y, width);
        break;
      case 'video':
        this.drawVideoPlaceholder(doc, comp, x, y, width, height);
        break;
      case 'skeleton':
        this.drawSkeleton(doc, x, y, width, height);
        break;
      case 'link':
        this.drawLink(doc, comp, x, y, width);
        break;
      case 'checkbox':
      case 'toggle':
        this.drawCheckbox(doc, comp, x, y, width);
        break;
      case 'icon':
        this.drawIcon(doc, comp, x, y, height);
        break;
      case 'sidebar':
        this.drawSidebar(doc, comp, x, y, width, height);
        break;
      case 'pricing':
        this.drawPricing(doc, comp, x, y, width, height);
        break;
      case 'testimonial':
        this.drawTestimonial(doc, comp, x, y, width, height);
        break;
      case 'fileUpload':
        this.drawFileUpload(doc, comp, x, y, width, height);
        break;
      case 'pagination':
        this.drawPagination(doc, x, y, width, height);
        break;
      default:
        // Generic fallback: draw children if any
        if (comp.children && comp.children.length > 0) {
          this.drawChildren(doc, comp, x, y, width, height);
        } else if (comp.label) {
          this.drawLabel(doc, comp.label, x + 8, y + height / 2 - 6, width - 16, s);
        }
    }
  }

  // ─── Component-Specific Drawers ───

  private drawHeading(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, _height: number) {
    const fontSize = this.parsePx(comp.style.fontSize ?? '28');
    const color = comp.style.color ?? '#0F172A';
    const align = (comp.style.textAlign as 'left' | 'center' | 'right') ?? 'left';
    if (comp.label) {
      doc.fontSize(Math.min(fontSize, 60))
        .fillColor(this.safeColor(color))
        .text(comp.label, x, y + 4, { width, align });
    }
  }

  private drawText(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, _height: number) {
    const fontSize = this.parsePx(comp.style.fontSize ?? '16');
    const color = comp.style.color ?? '#475569';
    if (comp.label) {
      doc.fontSize(Math.min(fontSize, 24))
        .fillColor(this.safeColor(color))
        .text(comp.label, x, y + 2, { width, lineGap: 4 });
    }
  }

  private drawButton(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, height: number) {
    const label = comp.label ?? 'Button';
    const fontSize = this.parsePx(comp.style.fontSize ?? '14');
    const btnWidth = Math.min(width, Math.max(120, label.length * 10 + 40));
    const btnHeight = Math.min(height, 48);
    const btnX = comp.style.justifyContent === 'center' ? x + (width - btnWidth) / 2 : x;
    const radius = this.parsePx(comp.style.borderRadius ?? '8');

    // Button background
    const bgColor = comp.style.backgroundColor ?? '#6366F1';
    if (bgColor !== 'transparent') {
      this.drawRoundedRect(doc, btnX, y, btnWidth, btnHeight, Math.min(radius, btnHeight / 2));
      doc.fill(this.safeColor(bgColor));
    }

    // Button border
    if (comp.style.border) {
      const borderColor = this.extractBorderColor(comp.style.border);
      if (borderColor) {
        this.drawRoundedRect(doc, btnX, y, btnWidth, btnHeight, Math.min(radius, btnHeight / 2));
        doc.strokeColor(this.safeColor(borderColor)).lineWidth(1.5).stroke();
      }
    }

    // Button text
    const textColor = comp.style.color ?? '#FFFFFF';
    doc.fontSize(fontSize)
      .fillColor(this.safeColor(textColor))
      .text(label, btnX, y + (btnHeight - fontSize) / 2, { width: btnWidth, align: 'center' });
  }

  private drawInput(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, height: number) {
    const inputH = Math.min(height, 44);
    const labelText = comp.label ?? '';
    let currentY = y;

    // Label
    if (labelText) {
      doc.fontSize(13).fillColor(this.safeColor(comp.style.color ?? '#0F172A'))
        .text(labelText, x, currentY, { width });
      currentY += 20;
    }

    // Input box
    const radius = this.parsePx(comp.style.borderRadius ?? '8');
    this.drawRoundedRect(doc, x, currentY, width, inputH, Math.min(radius, inputH / 2));
    doc.fill(this.safeColor(comp.style.backgroundColor ?? '#FFFFFF'));

    const borderColor = this.extractBorderColor(comp.style.border ?? '') ?? '#E2E8F0';
    this.drawRoundedRect(doc, x, currentY, width, inputH, Math.min(radius, inputH / 2));
    doc.strokeColor(this.safeColor(borderColor)).lineWidth(1).stroke();

    // Placeholder
    const placeholder = (comp.props?.placeholder as string) ?? '';
    if (placeholder) {
      doc.fontSize(14).fillColor('#94A3B8')
        .text(placeholder, x + 12, currentY + (inputH - 14) / 2, { width: width - 24 });
    }
  }

  private drawImagePlaceholder(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, height: number) {
    const radius = this.parsePx(comp.style.borderRadius ?? '12');
    this.drawRoundedRect(doc, x, y, width, height, Math.min(radius, height / 2, width / 2));
    doc.fill('#F1F5F9');

    // Image icon
    const iconSize = 32;
    const iconX = x + width / 2 - iconSize / 2;
    const iconY = y + height / 2 - iconSize / 2;
    doc.rect(iconX, iconY, iconSize, iconSize).fill('#CBD5E1');

    if (comp.label) {
      doc.fontSize(11).fillColor('#94A3B8')
        .text(comp.label, x, y + height / 2 + 20, { width, align: 'center' });
    }
  }

  private drawAvatar(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, height: number) {
    const size = height;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const bgColor = comp.style.backgroundColor ?? '#EEF2FF';
    const textColor = comp.style.color ?? '#6366F1';

    doc.circle(cx, cy, size / 2).fill(this.safeColor(bgColor));

    const initials = (comp.label ?? 'U').slice(0, 2).toUpperCase();
    const fontSize = this.parsePx(comp.style.fontSize ?? '16');
    doc.fontSize(fontSize).fillColor(this.safeColor(textColor))
      .text(initials, x, cy - fontSize / 2, { width: size, align: 'center' });
  }

  private drawCardContent(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, height: number) {
    if (comp.children && comp.children.length > 0) {
      this.drawChildren(doc, comp, x, y, width, height);
    } else if (comp.label) {
      doc.fontSize(14).fillColor(this.safeColor(comp.style.color ?? '#0F172A'))
        .text(comp.label, x + 16, y + 16, { width: width - 32 });
    }
  }

  private drawNav(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, height: number) {
    // Nav background already drawn. Draw items.
    const textColor = comp.style.color ?? '#FFFFFF';
    const items = (comp.props?.items as string[]) ?? [];

    // Logo placeholder
    doc.fontSize(16).fillColor(this.safeColor(textColor))
      .text('Logo', x + 24, y + (height - 16) / 2, { width: 80 });

    // Nav items
    let itemX = x + 120;
    for (const item of items.slice(0, 6)) {
      doc.fontSize(14).fillColor(this.safeColor(textColor))
        .text(item, itemX, y + (height - 14) / 2, { width: 100 });
      itemX += 100;
    }

    // Draw children (buttons, etc.)
    if (comp.children && comp.children.length > 0) {
      let childX = width - 200;
      for (const child of comp.children.slice(-2)) {
        const childW = 100;
        const childH = 36;
        this.drawComponent(doc, child, childX, y + (height - childH) / 2, childW, childH);
        childX += childW + 8;
      }
    }
  }

  private drawBadge(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, _width: number, height: number) {
    const label = comp.label ?? 'Badge';
    const badgeW = Math.max(60, label.length * 8 + 20);
    const badgeH = Math.min(height, 24);
    const radius = this.parsePx(comp.style.borderRadius ?? '9999');

    const bgColor = comp.style.backgroundColor ?? '#F1F5F9';
    this.drawRoundedRect(doc, x, y, badgeW, badgeH, Math.min(radius, badgeH / 2));
    doc.fill(this.safeColor(bgColor));

    if (comp.style.border) {
      const borderColor = this.extractBorderColor(comp.style.border);
      if (borderColor) {
        this.drawRoundedRect(doc, x, y, badgeW, badgeH, Math.min(radius, badgeH / 2));
        doc.strokeColor(this.safeColor(borderColor)).lineWidth(1).stroke();
      }
    }

    doc.fontSize(11).fillColor(this.safeColor(comp.style.color ?? '#475569'))
      .text(label, x, y + (badgeH - 11) / 2, { width: badgeW, align: 'center' });
  }

  private drawStats(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, _height: number) {
    const label = comp.label ?? 'Metric';
    const value = (comp.props?.value as string) ?? '0';
    const trend = comp.props?.trend as string;
    const trendValue = (comp.props?.trendValue as string) ?? '';
    const padding = 20;

    // Label
    doc.fontSize(12).fillColor('#94A3B8').text(label, x + padding, y + padding, { width: width - padding * 2 });
    // Value
    doc.fontSize(28).fillColor('#0F172A').text(value, x + padding, y + padding + 20, { width: width - padding * 2 });
    // Trend
    if (trend && trendValue) {
      const trendColor = trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#94A3B8';
      const arrow = trend === 'up' ? '+' : trend === 'down' ? '-' : '';
      doc.fontSize(13).fillColor(trendColor).text(`${arrow}${trendValue}`, x + padding, y + padding + 56, { width: width - padding * 2 });
    }
  }

  private drawChart(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, height: number) {
    const chartType = (comp.props?.chartType as string) ?? 'bar';
    const padding = 16;
    const innerX = x + padding;
    const innerY = y + padding + 24;
    const innerW = width - padding * 2;
    const innerH = height - padding * 2 - 24;

    // Title
    if (comp.label) {
      doc.fontSize(13).fillColor('#475569').text(comp.label, x + padding, y + padding, { width: innerW });
    }

    // Chart content
    doc.strokeColor('#E2E8F0').lineWidth(0.5);

    if (chartType === 'bar') {
      const barCount = 7;
      const barWidth = (innerW - (barCount - 1) * 8) / barCount;
      for (let i = 0; i < barCount; i++) {
        const barH = Math.random() * innerH * 0.7 + innerH * 0.1;
        const barX = innerX + i * (barWidth + 8);
        const barY = innerY + innerH - barH;
        this.drawRoundedRect(doc, barX, barY, barWidth, barH, 4);
        doc.fill(i % 2 === 0 ? '#6366F1' : '#A5B4FC');
      }
    } else if (chartType === 'line' || chartType === 'area') {
      const points = 8;
      const stepX = innerW / (points - 1);
      doc.strokeColor('#6366F1').lineWidth(2);
      let prevX = innerX;
      let prevY = innerY + innerH * (0.3 + Math.random() * 0.4);
      doc.moveTo(prevX, prevY);
      for (let i = 1; i < points; i++) {
        const px = innerX + i * stepX;
        const py = innerY + innerH * (0.15 + Math.random() * 0.6);
        doc.lineTo(px, py);
        prevX = px;
        prevY = py;
      }
      doc.stroke();
    } else if (chartType === 'pie' || chartType === 'donut') {
      const cx = x + width / 2;
      const cy = innerY + innerH / 2;
      const r = Math.min(innerW, innerH) / 2 - 10;
      doc.circle(cx, cy, r).fill('#6366F1');
      doc.circle(cx, cy, r * 0.6).fill('#A5B4FC');
      if (chartType === 'donut') {
        const bgC = comp.style.backgroundColor ?? '#FFFFFF';
        doc.circle(cx, cy, r * 0.35).fill(this.safeColor(bgC));
      }
    }
  }

  private drawTable(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, height: number) {
    const columns = (comp.props?.columns as number) ?? 4;
    const rows = 5;
    const colW = width / columns;
    const rowH = Math.min(40, height / (rows + 1));

    // Header
    doc.rect(x, y, width, rowH).fill('#F8FAFC');
    doc.strokeColor('#E2E8F0').lineWidth(0.5);
    for (let c = 0; c < columns; c++) {
      const label = (comp.props?.items as string[])?.[c] ?? `Column ${c + 1}`;
      doc.fontSize(12).fillColor('#475569').text(label, x + c * colW + 12, y + (rowH - 12) / 2, { width: colW - 24 });
    }

    // Rows
    for (let r = 1; r <= rows; r++) {
      const rowY = y + r * rowH;
      doc.moveTo(x, rowY).lineTo(x + width, rowY).stroke();
      for (let c = 0; c < columns; c++) {
        doc.fontSize(13).fillColor('#0F172A')
          .text('Data', x + c * colW + 12, rowY + (rowH - 13) / 2, { width: colW - 24 });
      }
    }

    // Bottom border
    doc.moveTo(x, y + (rows + 1) * rowH).lineTo(x + width, y + (rows + 1) * rowH).stroke();
  }

  private drawProgressBar(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, _height: number) {
    const value = Math.max(0, Math.min(100, Number(comp.props?.value ?? 60)));
    const barH = 8;
    const radius = 4;

    // Track
    this.drawRoundedRect(doc, x, y, width, barH, radius);
    doc.fill('#F1F5F9');

    // Fill
    const fillW = (width * value) / 100;
    if (fillW > 0) {
      this.drawRoundedRect(doc, x, y, fillW, barH, radius);
      doc.fill('#6366F1');
    }
  }

  private drawDivider(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number) {
    const color = comp.style.borderColor ?? '#F1F5F9';
    doc.moveTo(x, y).lineTo(x + width, y).strokeColor(this.safeColor(color)).lineWidth(1).stroke();
  }

  private drawSearchBar(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, height: number) {
    const h = Math.min(height, 48);
    const radius = this.parsePx(comp.style.borderRadius ?? '9999');

    this.drawRoundedRect(doc, x, y, width, h, Math.min(radius, h / 2));
    doc.fill(this.safeColor(comp.style.backgroundColor ?? '#F8FAFC'));

    const borderColor = this.extractBorderColor(comp.style.border ?? '') ?? '#E2E8F0';
    this.drawRoundedRect(doc, x, y, width, h, Math.min(radius, h / 2));
    doc.strokeColor(this.safeColor(borderColor)).lineWidth(1).stroke();

    // Search icon
    doc.circle(x + 20, y + h / 2, 6).strokeColor('#94A3B8').lineWidth(1.5).stroke();
    doc.moveTo(x + 25, y + h / 2 + 4).lineTo(x + 28, y + h / 2 + 7).stroke();

    const placeholder = (comp.props?.placeholder as string) ?? comp.label ?? 'Search...';
    doc.fontSize(14).fillColor('#94A3B8')
      .text(placeholder, x + 38, y + (h - 14) / 2, { width: width - 52 });
  }

  private drawHero(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, height: number) {
    if (comp.children && comp.children.length > 0) {
      this.drawChildren(doc, comp, x, y, width, height);
    } else if (comp.label) {
      const align = (comp.style.textAlign as 'left' | 'center' | 'right') ?? 'center';
      doc.fontSize(48).fillColor('#0F172A')
        .text(comp.label, x + 40, y + height / 3, { width: width - 80, align });
    }
  }

  private drawFooter(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, height: number) {
    const bgColor = comp.style.backgroundColor ?? '#0F172A';
    doc.rect(x, y, width, height).fill(this.safeColor(bgColor));
    const textColor = comp.style.color ?? '#E2E8F0';

    if (comp.children && comp.children.length > 0) {
      this.drawChildren(doc, comp, x, y, width, height);
    } else {
      doc.fontSize(13).fillColor(this.safeColor(textColor))
        .text('Footer content', x + 24, y + 40, { width: width - 48 });
    }
  }

  private drawStepper(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, height: number) {
    const steps = (comp.props?.steps as string[]) ?? ['Step 1', 'Step 2', 'Step 3'];
    const active = (comp.props?.activeStep as number) ?? 0;
    const stepW = width / steps.length;

    for (const [i, step] of steps.entries()) {
      const cx = x + i * stepW + stepW / 2;
      const cy = y + height / 2 - 8;
      const isActive = i <= active;

      // Circle
      doc.circle(cx, cy, 14).fill(isActive ? '#6366F1' : '#E2E8F0');
      doc.fontSize(12).fillColor(isActive ? '#FFFFFF' : '#94A3B8')
        .text(`${i + 1}`, cx - 5, cy - 6, { width: 10, align: 'center' });

      // Label
      doc.fontSize(12).fillColor(isActive ? '#0F172A' : '#94A3B8')
        .text(step, x + i * stepW, cy + 20, { width: stepW, align: 'center' });

      // Connector line
      if (i < steps.length - 1) {
        const lineColor = i < active ? '#6366F1' : '#E2E8F0';
        doc.moveTo(cx + 16, cy).lineTo(cx + stepW - 16, cy)
          .strokeColor(lineColor).lineWidth(2).stroke();
      }
    }
  }

  private drawBreadcrumb(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number) {
    const label = comp.label ?? 'Home > Page';
    doc.fontSize(13).fillColor(this.safeColor(comp.style.color ?? '#94A3B8'))
      .text(label, x, y + 4, { width });
  }

  private drawVideoPlaceholder(doc: PDFKit.PDFDocument, _comp: BeautifiedComponent, x: number, y: number, width: number, height: number) {
    doc.rect(x, y, width, height).fill('#0F172A');
    // Play button
    const cx = x + width / 2;
    const cy = y + height / 2;
    doc.circle(cx, cy, 28).fill('rgba(255,255,255,0.2)');
    doc.moveTo(cx - 8, cy - 12).lineTo(cx + 12, cy).lineTo(cx - 8, cy + 12).closePath().fill('#FFFFFF');
  }

  private drawSkeleton(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number) {
    const lineH = 12;
    const gap = 10;
    let currentY = y;
    const lines = Math.floor(height / (lineH + gap));
    for (let i = 0; i < lines; i++) {
      const lineW = i === 0 ? width * 0.6 : i === lines - 1 ? width * 0.4 : width * (0.7 + Math.random() * 0.3);
      this.drawRoundedRect(doc, x, currentY, lineW, lineH, 4);
      doc.fill('#F1F5F9');
      currentY += lineH + gap;
    }
  }

  private drawLink(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number) {
    const label = comp.label ?? 'Link';
    const color = comp.style.color ?? '#6366F1';
    doc.fontSize(14).fillColor(this.safeColor(color)).text(label, x, y + 4, { width });
  }

  private drawCheckbox(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, _width: number) {
    const checked = comp.props?.checked as boolean ?? comp.props?.enabled as boolean;
    const boxSize = 18;
    this.drawRoundedRect(doc, x, y + 4, boxSize, boxSize, 4);
    if (checked) {
      doc.fill('#6366F1');
    } else {
      doc.fill('#FFFFFF');
      this.drawRoundedRect(doc, x, y + 4, boxSize, boxSize, 4);
      doc.strokeColor('#CBD5E1').lineWidth(1.5).stroke();
    }

    if (comp.label) {
      doc.fontSize(14).fillColor('#0F172A').text(comp.label, x + boxSize + 8, y + 5);
    }
  }

  private drawIcon(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, height: number) {
    const size = height;
    const color = comp.style.color ?? '#475569';
    doc.rect(x + 2, y + 2, size - 4, size - 4).fill(this.safeColor(color));
  }

  private drawSidebar(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, height: number) {
    if (comp.children && comp.children.length > 0) {
      this.drawChildren(doc, comp, x, y, width, height);
    }
  }

  private drawPricing(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, _height: number) {
    const planName = comp.label ?? 'Plan';
    const price = (comp.props?.price as string) ?? '$0';
    const period = (comp.props?.period as string) ?? '/month';
    const featured = comp.props?.featured as boolean;

    const textColor = featured ? '#FFFFFF' : '#0F172A';
    const mutedColor = featured ? 'rgba(255,255,255,0.7)' : '#475569';

    doc.fontSize(16).fillColor(this.safeColor(textColor)).text(planName, x + 24, y + 24, { width: width - 48 });
    doc.fontSize(36).fillColor(this.safeColor(textColor)).text(price, x + 24, y + 52, { width: width - 48, continued: true });
    doc.fontSize(14).fillColor(this.safeColor(mutedColor)).text(period);

    if (comp.children && comp.children.length > 0) {
      let itemY = y + 108;
      for (const child of comp.children.slice(0, 6)) {
        if (child.label) {
          doc.fontSize(13).fillColor(this.safeColor(mutedColor)).text(`  ${child.label}`, x + 24, itemY, { width: width - 48 });
          itemY += 24;
        }
      }
    }
  }

  private drawTestimonial(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, _height: number) {
    if (comp.label) {
      doc.fontSize(15).fillColor('#475569').text(`"${comp.label}"`, x + 24, y + 24, { width: width - 48, lineGap: 4 });
    }
    if (comp.props?.rating) {
      const rating = Number(comp.props.rating);
      const stars = '★'.repeat(Math.min(rating, 5)) + '☆'.repeat(Math.max(0, 5 - rating));
      doc.fontSize(16).fillColor('#F59E0B').text(stars, x + 24, y + 80, { width: width - 48 });
    }
  }

  private drawFileUpload(doc: PDFKit.PDFDocument, comp: BeautifiedComponent, x: number, y: number, width: number, height: number) {
    const label = comp.label ?? 'Drag & drop files here';
    doc.fontSize(14).fillColor('#94A3B8')
      .text(label, x, y + height / 2 - 7, { width, align: 'center' });
  }

  private drawPagination(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number) {
    const pages = ['<', '1', '2', '3', '...', '10', '>'];
    const btnSize = 32;
    const gap = 4;
    const totalW = pages.length * (btnSize + gap);
    let startX = x + (width - totalW) / 2;

    for (const page of pages) {
      const isActive = page === '1';
      this.drawRoundedRect(doc, startX, y + (height - btnSize) / 2, btnSize, btnSize, 6);
      doc.fill(isActive ? '#6366F1' : '#F8FAFC');

      doc.fontSize(13).fillColor(isActive ? '#FFFFFF' : '#475569')
        .text(page, startX, y + (height - 13) / 2, { width: btnSize, align: 'center' });
      startX += btnSize + gap;
    }
  }

  // ─── Generic Children Drawing ───

  private drawChildren(
    doc: PDFKit.PDFDocument,
    comp: BeautifiedComponent,
    x: number,
    y: number,
    width: number,
    _height: number,
  ) {
    if (!comp.children) return;
    const padding = this.parsePx(comp.style.padding ?? '16');
    const gap = this.parsePx(comp.style.gap ?? '12');
    const direction = comp.style.flexDirection ?? 'column';

    let currentX = x + padding;
    let currentY = y + padding;
    const innerWidth = width - padding * 2;

    if (direction === 'row') {
      const childCount = comp.children.length || 1;
      const childWidth = (innerWidth - gap * (childCount - 1)) / childCount;
      for (const child of comp.children) {
        const childH = this.estimateComponentHeight(child, childWidth);
        this.drawComponent(doc, child, currentX, currentY, childWidth, childH);
        currentX += childWidth + gap;
      }
    } else {
      for (const child of comp.children) {
        const childH = this.estimateComponentHeight(child, innerWidth);
        this.drawComponent(doc, child, currentX, currentY, innerWidth, childH);
        currentY += childH + gap;
      }
    }
  }

  // ─── Height Estimation ───

  estimateScreenHeight(screen: BeautifiedScreen, viewportWidth: number): number {
    let total = 0;
    for (const section of screen.sections) {
      total += this.estimateSectionHeight(section, viewportWidth);
    }
    return Math.max(total, 600);
  }

  private estimateSectionHeight(section: BeautifiedSection, width: number): number {
    const padding = this.parsePx(section.style.padding ?? '24') * 2;
    const gap = this.parsePx(section.style.gap ?? '16');
    const layout = section.layout;
    const innerWidth = width - padding;

    if (layout === 'row' || layout === 'split') {
      // Horizontal: height is max of all children
      const colCount = section.components.length || 1;
      const colWidth = (innerWidth - gap * (colCount - 1)) / colCount;
      let maxH = 0;
      for (const comp of section.components) {
        maxH = Math.max(maxH, this.estimateComponentHeight(comp, colWidth));
      }
      return maxH + padding;
    }

    if (layout === 'grid') {
      const cols = this.getGridCols(section, innerWidth);
      const rows = Math.ceil(section.components.length / cols);
      const colWidth = (innerWidth - gap * (cols - 1)) / cols;
      let maxRowH = 0;
      let totalH = 0;
      let colIdx = 0;
      for (const comp of section.components) {
        maxRowH = Math.max(maxRowH, this.estimateComponentHeight(comp, colWidth));
        colIdx++;
        if (colIdx >= cols) {
          totalH += maxRowH + gap;
          maxRowH = 0;
          colIdx = 0;
        }
      }
      if (colIdx > 0) totalH += maxRowH;
      return totalH + padding;
    }

    // column / stack / sidebar
    let totalH = 0;
    for (const [i, comp] of section.components.entries()) {
      totalH += this.estimateComponentHeight(comp, innerWidth);
      if (i < section.components.length - 1) totalH += gap;
    }
    return totalH + padding;
  }

  private estimateComponentHeight(comp: BeautifiedComponent, width: number): number {
    const baseHeight = COMPONENT_MIN_HEIGHT[comp.type] ?? 40;

    // Specific overrides
    if (comp.type === 'image') {
      const size = (comp.props?.size as string) ?? 'md';
      return IMAGE_SIZE_HEIGHTS[size] ?? 240;
    }
    if (comp.type === 'avatar') {
      const size = (comp.props?.size as string) ?? 'md';
      return AVATAR_SIZES[size] ?? 48;
    }
    if (comp.type === 'chart') {
      const h = (comp.props?.height as string) ?? 'md';
      return CHART_HEIGHTS[h] ?? 320;
    }
    if (comp.type === 'input' || comp.type === 'select') {
      return comp.label ? 64 : 44;
    }

    // Container types with children
    if (comp.children && comp.children.length > 0) {
      const padding = this.parsePx(comp.style?.padding ?? '16') * 2;
      const gap = this.parsePx(comp.style?.gap ?? '12');
      const direction = comp.style?.flexDirection ?? 'column';

      if (direction === 'row') {
        const childWidth = (width - padding) / comp.children.length;
        let maxH = 0;
        for (const child of comp.children) {
          maxH = Math.max(maxH, this.estimateComponentHeight(child, childWidth));
        }
        return maxH + padding;
      }

      let totalH = padding;
      for (const [i, child] of comp.children.entries()) {
        totalH += this.estimateComponentHeight(child, width - padding);
        if (i < comp.children.length - 1) totalH += gap;
      }
      return Math.max(totalH, baseHeight);
    }

    // Text content height estimation
    if (comp.label && (comp.type === 'text' || comp.type === 'heading')) {
      const fontSize = this.parsePx(comp.style?.fontSize ?? '16');
      const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.6)));
      const lines = Math.ceil(comp.label.length / charsPerLine);
      return Math.max(baseHeight, lines * fontSize * 1.5 + 8);
    }

    return baseHeight;
  }

  // ─── Helpers ───

  private drawRoundedRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, r: number) {
    if (r <= 0) {
      doc.rect(x, y, w, h);
      return;
    }
    r = Math.min(r, w / 2, h / 2);
    doc.moveTo(x + r, y)
      .lineTo(x + w - r, y)
      .quadraticCurveTo(x + w, y, x + w, y + r)
      .lineTo(x + w, y + h - r)
      .quadraticCurveTo(x + w, y + h, x + w - r, y + h)
      .lineTo(x + r, y + h)
      .quadraticCurveTo(x, y + h, x, y + h - r)
      .lineTo(x, y + r)
      .quadraticCurveTo(x, y, x + r, y)
      .closePath();
  }

  private drawLabel(doc: PDFKit.PDFDocument, label: string, x: number, y: number, width: number, style: ResolvedStyle) {
    const fontSize = this.parsePx(style.fontSize ?? '14');
    const color = style.color ?? '#475569';
    doc.fontSize(fontSize).fillColor(this.safeColor(color)).text(label, x, y, { width });
  }

  private parsePx(value: string | number): number {
    if (typeof value === 'number') return value;
    const match = value.match(/^(-?\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
  }

  private safeColor(color: string): string {
    if (!color) return '#000000';
    if (color.startsWith('rgba') || color.startsWith('rgb')) return '#94A3B8';
    if (color.startsWith('linear-gradient') || color.startsWith('radial-gradient')) return '#F8FAFC';
    if (/^#[0-9a-fA-F]{3,8}$/.test(color)) return color;
    return '#000000';
  }

  private extractBorderColor(border: string): string | null {
    const match = border.match(/(#[0-9a-fA-F]{3,8})/);
    return match ? match[1] : null;
  }

  private getGridCols(section: BeautifiedSection, width: number): number {
    const templateCols = section.style.gridTemplateColumns;
    if (templateCols) {
      const repeatMatch = templateCols.match(/repeat\((\d+)/);
      if (repeatMatch) return parseInt(repeatMatch[1], 10);
    }
    // Auto-fit: estimate columns based on width
    const minColW = 280;
    return Math.max(1, Math.floor(width / minColW));
  }
}
