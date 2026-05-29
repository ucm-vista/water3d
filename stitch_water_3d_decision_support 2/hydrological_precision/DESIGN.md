---
name: Hydrological Precision
colors:
  surface: '#fbf9f5'
  surface-dim: '#dbdad6'
  surface-bright: '#fbf9f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3ef'
  surface-container: '#f0eeea'
  surface-container-high: '#eae8e4'
  surface-container-highest: '#e4e2de'
  on-surface: '#1b1c1a'
  on-surface-variant: '#43474c'
  inverse-surface: '#30312e'
  inverse-on-surface: '#f2f0ec'
  outline: '#74777c'
  outline-variant: '#c4c6cc'
  surface-tint: '#506071'
  primary: '#051625'
  on-primary: '#ffffff'
  primary-container: '#1b2b3a'
  on-primary-container: '#8292a5'
  inverse-primary: '#b8c8dc'
  secondary: '#934936'
  on-secondary: '#ffffff'
  secondary-container: '#ffa188'
  on-secondary-container: '#783523'
  tertiary: '#061908'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b2e1a'
  on-tertiary-container: '#80977c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d3e4f8'
  primary-fixed-dim: '#b8c8dc'
  on-primary-fixed: '#0c1d2b'
  on-primary-fixed-variant: '#384858'
  secondary-fixed: '#ffdbd2'
  secondary-fixed-dim: '#ffb4a1'
  on-secondary-fixed: '#3c0800'
  on-secondary-fixed-variant: '#753321'
  tertiary-fixed: '#d1e9cb'
  tertiary-fixed-dim: '#b5cdb0'
  on-tertiary-fixed: '#0d200d'
  on-tertiary-fixed-variant: '#374c36'
  background: '#fbf9f5'
  on-background: '#1b1c1a'
  surface-variant: '#e4e2de'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.3'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  data-display:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  container-padding-mobile: 16px
  container-padding-desktop: 32px
  gutter: 24px
  card-gap: 16px
---

## Brand & Style
This design system is engineered for high-stakes agricultural decision-making. It adopts a **Corporate Modern** aesthetic infused with **Minimalism** to ensure that data remains the primary focus. The visual narrative balances the raw, organic reality of farming with the surgical precision of 3D hydrological modeling. 

The UI must feel like a specialized instrument—reliable, understated, and authoritative. By utilizing heavy whitespace and a strict adherence to grid systems, the design system avoids the cluttered "dashboard fatigue" common in weather apps, instead providing a calm, focused environment for analyzing soil moisture, transpiration rates, and irrigation efficiency.

## Colors
The palette is derived from the intersection of earth and water. 
- **Primary (Deep Navy):** Represents deep water and professional stability. Used for primary navigation, headings, and core interactive elements.
- **Secondary (Terracotta):** An earth-toned accent used sparingly for call-to-actions or to highlight critical soil-related data points.
- **Tertiary (Sage):** Used for "healthy" status indicators and growth-related metrics.
- **Neutral (Sand/Slate):** The background is a warm, desaturated sand (#F4F2EE) to reduce eye strain in outdoor environments, while slate grays handle borders and secondary text.

Status indicators use functional, muted versions of traditional alert colors (e.g., Slate Blue for frost, Burnt Amber for heat) to maintain the serious, data-driven tone without becoming visually aggressive.

## Typography
This design system utilizes **Inter** for all functional and editorial text to ensure maximum legibility and a systematic feel. For technical data readouts, coordinates, and sensor values, **Geist** is employed to provide a "developer-tool" precision that distinguishes raw data from instructional text.

Typography is scaled to prioritize hierarchy in dense data environments. Large headlines are reserved for field names and primary metrics, while a strict labeling system using Geist ensures that unit measurements (e.g., mm/h, VWC%) are always distinct and readable at a glance.

## Layout & Spacing
The layout relies on a **Fixed Grid** model for desktop to maintain the integrity of complex data visualizations, transitioning to a fluid single-column stack for mobile field use. 

- **Desktop:** 12-column grid with a 1200px max-width, 24px gutters, and 32px margins. 
- **Tablet:** 8-column grid with 24px margins.
- **Mobile:** 4-column fluid grid with 16px margins.

The spacing rhythm is strictly based on an 8px baseline. Cards are used to encapsulate different data streams (e.g., Soil Sensors, Satellite Imagery, Irrigation Schedule), using consistent padding to create a modular, organized workspace.

## Elevation & Depth
To maintain a professional and "flat" technical feel, this design system eschews traditional shadows in favor of **Tonal Layers** and **Low-Contrast Outlines**. 

Depth is communicated through background color shifts:
- **Level 0 (Canvas):** The base Sand neutral (#F4F2EE).
- **Level 1 (Card):** White (#FFFFFF) surfaces with a 1px border in Slate-200.
- **Level 2 (Overlays/Modals):** White surfaces with a very subtle, diffused 15% opacity Deep Navy shadow to suggest a physical lift from the dashboard.

Interactive elements like buttons use a slight darkening of their surface color rather than a shadow to indicate a "pressed" state, reinforcing the tactile tool-like nature of the UI.

## Shapes
The shape language is **Soft (Level 1)**. This subtle rounding (4px for standard components, 8px for cards) softens the industrial nature of the data without appearing too consumer-grade or playful. 

Status indicators and alert badges utilize the same 4px radius, creating a cohesive "stamp" look. Data visualization bars and chart elements should remain sharp-edged or use the minimum 2px radius to emphasize precision and mathematical accuracy.

## Components

### Buttons
Primary buttons use the Deep Navy background with white text. Secondary buttons use a Slate-200 outline. The shape is a subtle 4px rounded rectangle. Labels are set in Inter Medium.

### Cards
Cards are the primary container. They must feature a 1px border (#E2E8F0) and no shadow. Headers within cards should have a thin bottom-divider to separate titles from the data body.

### Status Indicators (Alerts)
Alerts for Frost, Heat, or High-VPD (Vapor Pressure Deficit) are displayed as small, rectangular badges with high-contrast text. They are not icon-heavy; they rely on color-coding and clear Geist-font labels (e.g., "ALRT: FROST").

### Input Fields
Inputs are structured with a 1px border and a subtle Sand-50 background. Focus states are indicated by a 2px Deep Navy border. Labels always sit above the field in Geist-font Label-sm.

### Data Lists
Used for sensor logs. Every other row features a subtle Sand-50 tint for readability. Columns are strictly aligned to the grid, with numerical data right-aligned for easy comparison.

### 3D Map Controls
Specialized floating controls for the 3D hydrological view. These use a semi-transparent Deep Navy background (90% opacity) with white iconography, positioned in the bottom-right of the viewport.