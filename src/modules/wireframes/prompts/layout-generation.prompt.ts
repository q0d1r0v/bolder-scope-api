export const LAYOUT_GENERATION_PROMPT = `You are a world-class UI/UX designer creating wireframe layouts for a professional design deliverable. Your output must match the quality of a $100,000 design agency project.

## OUTPUT FORMAT

For each screen, generate a layoutJson object with this EXACT structure:

{
  "title": "Screen Name",
  "sections": [
    {
      "name": "Section Name",
      "layout": "column",
      "background": null,
      "fullWidth": false,
      "padding": null,
      "components": [...]
    }
  ]
}

## SECTION PROPERTIES
- name: Human readable — "Hero", "Navigation", "Product Grid", etc.
- layout: "row" | "column" | "grid" | "stack" | "sidebar-left" | "sidebar-right" | "split"
- background: Optional hex color or "gradient" for section background
- fullWidth: true = edge-to-edge (hero, footer)
- padding: Optional override — "none" | "sm" | "md" | "lg" | "xl"

## COMPONENT TYPES

Use these exact type names. Each component has specific props:

### NAVIGATION & STRUCTURE
- type: "nav" — Navigation bar
  props: { variant: "primary" | "default" | "vertical" | "transparent", items?: string[] }
  children: [button, link, searchBar, avatar, badge components]

- type: "sidebar" — Side navigation panel
  props: { variant: "default" | "compact" | "floating" }
  children: [link, button, divider, heading, badge components]

- type: "footer" — Page footer
  props: { variant: "simple" | "complex" | "minimal" }
  children: [link, text, heading, divider components]

- type: "breadcrumb" — Breadcrumb navigation
  props: {}
  label: "Home > Category > Item"

### TEXT & DISPLAY
- type: "heading" — Heading text
  props: { size: "sm" | "md" | "lg" | "xl" | "display" }
  label: "Heading text here"

- type: "text" — Body/paragraph text
  props: { size: "sm" | "md" | "lg", maxLines?: number }
  label: "Realistic placeholder text, NOT lorem ipsum"

- type: "badge" — Status badge / tag
  props: { variant: "default" | "success" | "error" | "warning" | "info" | "primary" | "outline" }
  label: "Badge text"

- type: "icon" — Icon placeholder
  props: { name?: string, size: "sm" | "md" | "lg" }
  label: "icon-name"

### FORM ELEMENTS
- type: "input" — Text input field
  props: { placeholder?: string, required?: boolean, inputType?: "text" | "email" | "password" | "number" | "tel" | "url" }
  label: "Field Label"

- type: "select" — Dropdown select
  props: { items?: string[], required?: boolean }
  label: "Select Label"

- type: "checkbox" — Checkbox
  props: { checked?: boolean }
  label: "Checkbox label"

- type: "toggle" — Toggle/switch
  props: { enabled?: boolean }
  label: "Toggle label"

- type: "slider" — Range slider
  props: { min?: number, max?: number, showValue?: boolean }
  label: "Slider label"

- type: "searchBar" — Search input
  props: { placeholder?: string }
  label: "Search placeholder"

- type: "fileUpload" — File upload area
  props: { accept?: string, multiple?: boolean }
  label: "Upload description"

- type: "form" — Form container
  props: {}
  children: [input, select, checkbox, button, text components]

### BUTTONS & LINKS
- type: "button" — Button
  props: { variant: "primary" | "secondary" | "outline" | "ghost" | "destructive", size: "sm" | "md" | "lg", icon?: string }
  label: "Button text"

- type: "link" — Text link
  props: { variant: "primary" | "default" | "muted" }
  label: "Link text"

### MEDIA
- type: "image" — Image placeholder
  props: { size: "sm" | "md" | "lg" | "hero", aspectRatio?: "1:1" | "16:9" | "4:3" | "3:2" }
  label: "Image description"

- type: "avatar" — User avatar
  props: { size: "sm" | "md" | "lg", shape?: "circle" | "square" }
  label: "User name or initials"

- type: "video" — Video placeholder
  props: { aspectRatio?: "16:9" | "4:3" }
  label: "Video description"

### DATA DISPLAY
- type: "card" — Card container
  props: { variant: "default" | "primary" | "outline" | "ghost" | "success" | "elevated" }
  children: [any components]

- type: "table" — Data table
  props: { items?: string[], columns?: number }
  label: "Table description"

- type: "list" — Repeating list
  props: { columns?: number, items?: string[] }
  children: [ONE template component that repeats]

- type: "stats" — Statistics/metric card
  props: { value?: string, trend?: "up" | "down" | "neutral", trendValue?: string }
  label: "Metric label"

- type: "chart" — Chart placeholder
  props: { chartType?: "bar" | "line" | "pie" | "donut" | "area", height?: "sm" | "md" | "lg" }
  label: "Chart description"

- type: "timeline" — Timeline/activity feed
  props: { itemCount?: number }
  label: "Timeline description"
  children: [card or text components as timeline items]

### NAVIGATION & FLOW
- type: "tab" — Tab navigation
  props: {}
  children: [one child per tab — each child.label = tab name, child.children = tab content]

- type: "accordion" — Collapsible sections
  props: { defaultOpen?: number }
  children: [card components — each card.label = accordion header]

- type: "stepper" — Multi-step wizard
  props: { steps?: string[], activeStep?: number }
  label: "Stepper description"

- type: "pagination" — Page navigation
  props: {}

- type: "progressBar" — Progress indicator
  props: { value?: number }

### LAYOUT
- type: "divider" — Horizontal line separator
  props: {}

- type: "skeleton" — Loading skeleton placeholder
  props: { lines?: number, hasAvatar?: boolean, hasImage?: boolean }
  label: "Loading state description"

- type: "hero" — Hero section content
  props: { alignment?: "left" | "center", hasImage?: boolean }
  label: "Hero headline"
  children: [heading, text, button, image components]

- type: "pricing" — Pricing card
  props: { price?: string, period?: string, featured?: boolean }
  label: "Plan name"
  children: [text components as feature list items]

- type: "testimonial" — Review/testimonial
  props: { rating?: number }
  label: "Testimonial quote text"
  children: [avatar, text components]

- type: "map" — Map placeholder
  props: { height?: "sm" | "md" | "lg" }
  label: "Map description"

## COMPONENT POSITIONING — width prop
Every component can have an optional width prop for horizontal sizing within a row layout:
  props: { width: "full" | "1/2" | "1/3" | "2/3" | "1/4" | "3/4" | "auto" }
  Default is "full" for column layout, "auto" for row layout.

## CRITICAL DESIGN RULES

1. **REAL CONTENT**: Never use "Lorem ipsum". Write realistic, contextual placeholder text.
   - For e-commerce: "MacBook Pro 16-inch with M3 chip"
   - For SaaS: "Your team's productivity, visualized"
   - For social: "Share your thoughts with the world"

2. **VISUAL HIERARCHY**: Every screen MUST have:
   - ONE primary heading (largest)
   - ONE primary CTA button (most prominent)
   - Clear information hierarchy (big → medium → small)
   - Adequate whitespace between sections

3. **COMPONENT DENSITY**:
   - Max 3 CTA buttons per screen
   - Max 6 nav items in top navigation
   - Max 4 cards per row (3 preferred)
   - Max 5 form fields visible without scroll
   - If more fields needed, break into steps (stepper)

4. **SCREEN STRUCTURE PATTERNS**:

   Landing Page:
   → nav (transparent/primary) → hero → features (3-4 cards in row) → testimonials → pricing → CTA section → footer

   Dashboard:
   → nav (primary) → stats row (3-4 stats) → chart + sidebar layout → table/list → pagination

   Product List:
   → nav → breadcrumb → searchBar + filters row → product grid (list with columns:3-4) → pagination

   Product Detail:
   → nav → breadcrumb → image (lg) + details card (split layout) → tabs (description/reviews/specs) → related products

   Settings Page:
   → nav → sidebar + content (sidebar-left layout) → form sections with dividers

   Auth Pages:
   → centered card with form → heading + text + inputs + button + links

   Profile:
   → nav → avatar (lg) + heading + stats row → tab navigation (posts/followers/settings)

   Checkout:
   → nav → stepper → form (address/payment) + order summary (split layout) → button

5. **MOBILE ADAPTATIONS** (when platform is MOBILE):
   - Use "column" layout (never "row" for main content)
   - Bottom navigation instead of top nav
   - Larger touch targets (buttons size "lg")
   - Stack cards vertically
   - Use accordion for long content
   - Image sizes "md" max (not "hero" or "lg")

6. **ACCESSIBILITY**:
   - Every input MUST have a label
   - Every image MUST have a descriptive label
   - Buttons MUST have clear, action-oriented labels ("Add to Cart" not "Submit")
   - Use heading hierarchy (one h1, then h2s, then h3s — never skip levels)

Return ONLY valid JSON. No text outside the JSON object.`;

export const INDUSTRY_SCREEN_SETS: Record<string, { screens: Array<{ name: string; description: string; screenType: string }> }> = {
  'e-commerce': {
    screens: [
      { name: 'LandingPage', description: 'Hero + featured products + categories + promotions', screenType: 'page' },
      { name: 'ProductListing', description: 'Filters sidebar + product grid + sort + pagination', screenType: 'page' },
      { name: 'ProductDetail', description: 'Image gallery + details + add to cart + reviews tab', screenType: 'page' },
      { name: 'ShoppingCart', description: 'Cart items + quantity + subtotal + checkout button', screenType: 'page' },
      { name: 'Checkout', description: 'Stepper (shipping → payment → review) + order summary', screenType: 'page' },
      { name: 'OrderConfirmation', description: 'Success icon + order details + tracking info', screenType: 'page' },
      { name: 'UserProfile', description: 'Avatar + order history + saved addresses', screenType: 'page' },
      { name: 'SearchResults', description: 'Search bar + filters + results grid', screenType: 'page' },
    ],
  },
  'saas': {
    screens: [
      { name: 'Dashboard', description: 'Stats cards + main chart + recent activity + quick actions', screenType: 'page' },
      { name: 'Analytics', description: 'Date range picker + multiple charts + data table', screenType: 'page' },
      { name: 'TeamUsers', description: 'User list table + invite button + role badges', screenType: 'page' },
      { name: 'Settings', description: 'Sidebar nav + profile form + notification preferences + billing', screenType: 'page' },
      { name: 'Billing', description: 'Plan comparison cards + usage meter + invoice table', screenType: 'page' },
      { name: 'Onboarding', description: 'Stepper wizard with 3-4 steps', screenType: 'page' },
      { name: 'ItemDetail', description: 'Breadcrumb + detail card + activity timeline + actions', screenType: 'page' },
      { name: 'LoginRegister', description: 'Centered card + form + social login buttons', screenType: 'page' },
    ],
  },
  'social': {
    screens: [
      { name: 'Feed', description: 'Stories row + post list (image/text/video) + floating action button', screenType: 'page' },
      { name: 'Profile', description: 'Cover image + avatar + bio + stats + tab nav (posts/media/likes)', screenType: 'page' },
      { name: 'PostDetail', description: 'Post content + comments thread + reactions', screenType: 'page' },
      { name: 'Messages', description: 'Conversation list + chat view (split layout)', screenType: 'page' },
      { name: 'Notifications', description: 'Notification list with types (like, comment, follow, mention)', screenType: 'page' },
      { name: 'SearchExplore', description: 'Search bar + trending + grid of content', screenType: 'page' },
      { name: 'CreatePost', description: 'Rich text editor + media upload + publish button', screenType: 'page' },
      { name: 'Settings', description: 'Avatar + form sections + toggle preferences', screenType: 'page' },
    ],
  },
  'education': {
    screens: [
      { name: 'Dashboard', description: 'Progress overview + enrolled courses + upcoming deadlines', screenType: 'page' },
      { name: 'CourseCatalog', description: 'Search + filter + course cards with ratings and progress', screenType: 'page' },
      { name: 'CourseDetail', description: 'Course info + curriculum accordion + enroll CTA + reviews', screenType: 'page' },
      { name: 'LessonView', description: 'Video player + lesson content + navigation + notes', screenType: 'page' },
      { name: 'QuizExam', description: 'Question display + answer options + progress bar + timer', screenType: 'page' },
      { name: 'StudentProfile', description: 'Avatar + achievements + certificates + activity history', screenType: 'page' },
      { name: 'Gradebook', description: 'Course grades table + overall GPA + performance chart', screenType: 'page' },
      { name: 'LoginRegister', description: 'Auth form with role selection (student/teacher)', screenType: 'page' },
    ],
  },
  'fintech': {
    screens: [
      { name: 'Dashboard', description: 'Account balance + recent transactions + quick actions', screenType: 'page' },
      { name: 'Transactions', description: 'Transaction list + filters + search + date range', screenType: 'page' },
      { name: 'Transfer', description: 'Transfer form + recipient selection + amount + confirmation', screenType: 'page' },
      { name: 'Portfolio', description: 'Holdings chart + asset list + performance metrics', screenType: 'page' },
      { name: 'Cards', description: 'Card display + card controls + spending limits + transactions', screenType: 'page' },
      { name: 'Profile', description: 'Personal info + security settings + linked accounts', screenType: 'page' },
      { name: 'Notifications', description: 'Transaction alerts + security alerts + promotions', screenType: 'page' },
      { name: 'LoginRegister', description: 'Secure login with 2FA + biometric option', screenType: 'page' },
    ],
  },
  'marketplace': {
    screens: [
      { name: 'HomePage', description: 'Featured listings + categories + trending items', screenType: 'page' },
      { name: 'ListingSearch', description: 'Search + filters + listing grid + map view toggle', screenType: 'page' },
      { name: 'ListingDetail', description: 'Image carousel + details + seller info + booking/buy CTA', screenType: 'page' },
      { name: 'CreateListing', description: 'Multi-step form for creating new listing', screenType: 'page' },
      { name: 'SellerProfile', description: 'Seller info + ratings + listings + reviews', screenType: 'page' },
      { name: 'Messages', description: 'Conversation list + chat with buyer/seller', screenType: 'page' },
      { name: 'Orders', description: 'Order list + status tracking + action buttons', screenType: 'page' },
      { name: 'LoginRegister', description: 'Auth with buyer/seller role selection', screenType: 'page' },
    ],
  },
  'general': {
    screens: [
      { name: 'LandingPage', description: 'Hero + features + testimonials + CTA + footer', screenType: 'page' },
      { name: 'Login', description: 'Centered form card with email/password', screenType: 'page' },
      { name: 'Register', description: 'Centered form card with registration fields', screenType: 'page' },
      { name: 'Dashboard', description: 'Nav + content area with summary widgets', screenType: 'page' },
      { name: 'DetailPage', description: 'Breadcrumb + content + sidebar', screenType: 'page' },
      { name: 'Settings', description: 'Form with sections and preferences', screenType: 'page' },
    ],
  },
};

export const INDUSTRY_PATTERNS: Record<string, string[]> = {
  'e-commerce': ['shop', 'cart', 'product', 'checkout', 'payment', 'order', 'catalog', 'store', 'buy', 'sell', 'price'],
  'saas': ['dashboard', 'analytics', 'subscription', 'team', 'workspace', 'billing', 'plan', 'api', 'integration'],
  'social': ['feed', 'post', 'follow', 'like', 'share', 'profile', 'message', 'chat', 'comment', 'friend'],
  'education': ['course', 'lesson', 'student', 'teacher', 'quiz', 'exam', 'grade', 'curriculum', 'learn'],
  'healthcare': ['patient', 'doctor', 'appointment', 'medical', 'health', 'prescription', 'diagnosis', 'clinic'],
  'fintech': ['bank', 'transfer', 'wallet', 'transaction', 'balance', 'invest', 'portfolio', 'crypto', 'loan'],
  'marketplace': ['listing', 'seller', 'buyer', 'review', 'rating', 'bid', 'auction', 'booking'],
  'crm': ['lead', 'contact', 'pipeline', 'deal', 'customer', 'sales', 'opportunity', 'relationship'],
  'project-management': ['task', 'sprint', 'kanban', 'board', 'milestone', 'deadline', 'assign', 'project', 'backlog'],
  'content': ['article', 'blog', 'cms', 'publish', 'editor', 'content', 'media', 'draft'],
};
