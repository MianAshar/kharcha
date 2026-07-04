---
name: Kharcha Light
colors:
  surface: '#fff8f7'
  surface-dim: '#eed4d4'
  surface-bright: '#fff8f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff0f0'
  surface-container: '#ffe9e9'
  surface-container-high: '#fde2e2'
  surface-container-highest: '#f7dcdd'
  on-surface: '#261819'
  on-surface-variant: '#5a4042'
  inverse-surface: '#3d2c2d'
  inverse-on-surface: '#ffeced'
  outline: '#8e7071'
  outline-variant: '#e2bebf'
  surface-tint: '#b71d3f'
  primary: '#b3193d'
  on-primary: '#ffffff'
  primary-container: '#d63653'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb2b7'
  secondary: '#5d5c74'
  on-secondary: '#ffffff'
  secondary-container: '#e2e0fc'
  on-secondary-container: '#63627a'
  tertiary: '#006a42'
  on-tertiary: '#ffffff'
  tertiary-container: '#008655'
  on-tertiary-container: '#f6fff6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdadb'
  primary-fixed-dim: '#ffb2b7'
  on-primary-fixed: '#40000e'
  on-primary-fixed-variant: '#91002b'
  secondary-fixed: '#e2e0fc'
  secondary-fixed-dim: '#c6c4df'
  on-secondary-fixed: '#1a1a2e'
  on-secondary-fixed-variant: '#45455b'
  tertiary-fixed: '#84f9ba'
  tertiary-fixed-dim: '#67dc9f'
  on-tertiary-fixed: '#002111'
  on-tertiary-fixed-variant: '#005232'
  background: '#fff8f7'
  on-background: '#261819'
  surface-variant: '#f7dcdd'
typography:
  display-currency:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  h1:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  h2:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-bold:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  amount-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 24px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  container-margin: 20px
  gutter: 16px
---

## Brand & Style

This design system is built on the principles of **Modern Minimalism** with a focus on financial clarity and high-velocity utility. The brand personality is professional yet energetic, utilizing a high-contrast palette to ensure that critical data—specifically currency and spending alerts—is immediately legible.

The aesthetic prioritizes a "breathable" interface where white space acts as a functional separator rather than just a stylistic choice. By pairing an off-white foundation with pure white surfaces, the system achieves a sense of layered organization that feels light and unobtrusive, allowing the user's financial data to remain the primary focus.

## Colors

The color strategy for this design system utilizes a high-contrast triad to manage information hierarchy:

- **Accent (Coral Red):** Reserved strictly for Primary CTAs, negative expense values, and critical budget alerts. This creates a psychological "action" trigger.
- **Primary Text (Dark Navy):** Used for navigation headers and primary body copy to ensure maximum accessibility and a premium, corporate feel.
- **Foundation (Off-White & Pure White):** The #F8F9FA background provides a soft canvas that reduces eye strain, while #FFFFFF cards "pop" forward to house interactive content.
- **Semantic Colors:** Success green is used for income and positive balances, providing a clear visual binary against the coral red expenses.

## Typography

The design system exclusively utilizes **Inter** for its systematic, utilitarian nature. The typographic hierarchy is driven by weight rather than just scale.

Critical instructions:
- **Currency:** All currency amounts must use a **Bold (700)** weight. For dashboard overviews, use the `display-currency` token with negative letter spacing to create a compact, modern look.
- **Headers:** Navigation and section headers use Dark Navy (#1A1A2E) with Semi-Bold or Bold weights to maintain high contrast against the off-white background.
- **Readability:** Body text uses a generous line height (1.5x) to ensure transaction lists remain legible during rapid scrolling.

## Layout & Spacing

This design system employs a **Fluid Grid** model with a base unit of 4px. This 4-point rhythmic system ensures consistent alignment across all screen sizes.

- **Margins:** Mobile layouts should maintain a 20px outer margin to provide a visual buffer.
- **Sectioning:** Vertical spacing between cards and content blocks should default to 16px (md) or 24px (lg) to prevent visual clutter.
- **Density:** Transaction lists should utilize the `sm` (12px) padding token for high-density data viewing, while dashboard cards use `lg` (24px) for a more premium, airy feel.

## Elevation & Depth

Elevation in this design system is achieved through **Tonal Layering** and **Ambient Shadows** rather than heavy borders.

- **Level 0 (Background):** #F8F9FA.
- **Level 1 (Cards/Surfaces):** #FFFFFF. These elements feature a very subtle, diffused shadow: `0px 4px 12px rgba(26, 26, 46, 0.05)`. This creates a soft lift that distinguishes the interactive surface from the background.
- **Level 2 (Modals/Overlays):** These use a more pronounced shadow: `0px 12px 32px rgba(26, 26, 46, 0.12)` to pull the focus forward and dim the background layers.
- **Interactions:** On hover or tap, cards may slightly increase their shadow spread or use a 1px soft stroke in the accent color to indicate focus.

## Shapes

The shape language is defined by friendly, approachable geometry. 

- **Cards:** Use a standard radius of **16px** (equivalent to `rounded-xl` in this system) to create a soft, modern container.
- **Pills & Buttons:** Elements such as category tags and CTAs use a full pill shape (100px or `rounded-full`) to differentiate them from the structural containers.
- **Inputs:** Form fields follow the card radius at 12px to maintain consistency while appearing slightly more rigid for data entry.

## Components

### Buttons
- **Primary:** Coral Red (#E94560) background with White text. Bold weight. Rounded pill shape.
- **Secondary:** Dark Navy (#1A1A2E) ghost style with a 1.5px border or light navy tint background.

### Cards
- Pure White (#FFFFFF) background. 16px corner radius. Subtle soft shadow. Padding should be 20px or 24px.

### Transaction Lists
- High-contrast Navy text for the merchant/category name.
- Bold Coral Red for expense amounts; Success Green for income.
- Separators should be 1px lines using #F1F3F5 (a slightly darker tint than the background).

### Chips (Category Tags)
- Use a pill shape with a 12px font size. Backgrounds should be light tints of the category color (e.g., 10% opacity) with high-contrast text.

### Progress Bars (Budgets)
- Track background: #E9ECEF.
- Progress fill: Coral Red (#E94560).
- Use a 8px height with fully rounded caps.

### Inputs
- Background: #FFFFFF.
- Border: 1px #DEE2E6.
- Focus State: 1.5px Coral Red border with a very light red glow.