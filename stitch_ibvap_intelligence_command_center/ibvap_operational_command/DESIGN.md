---
name: IBVAP Operational Command
colors:
  surface: '#131314'
  surface-dim: '#131314'
  surface-bright: '#39393a'
  surface-container-lowest: '#0e0e0f'
  surface-container-low: '#1b1b1c'
  surface-container: '#1f1f20'
  surface-container-high: '#2a2a2b'
  surface-container-highest: '#353536'
  on-surface: '#e4e2e3'
  on-surface-variant: '#c5c6cc'
  inverse-surface: '#e4e2e3'
  inverse-on-surface: '#303031'
  outline: '#8f9196'
  outline-variant: '#44474c'
  surface-tint: '#bdc7d8'
  primary: '#bdc7d8'
  on-primary: '#27313e'
  primary-container: '#4b5563'
  on-primary-container: '#bfcada'
  inverse-primary: '#555f6d'
  secondary: '#bfc7d3'
  on-secondary: '#29313a'
  secondary-container: '#3f4751'
  on-secondary-container: '#aeb6c1'
  tertiary: '#d9c3a5'
  on-tertiary: '#3c2e19'
  tertiary-container: '#62523a'
  on-tertiary-container: '#dcc6a8'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d9e3f4'
  primary-fixed-dim: '#bdc7d8'
  on-primary-fixed: '#121c28'
  on-primary-fixed-variant: '#3e4755'
  secondary-fixed: '#dbe3ef'
  secondary-fixed-dim: '#bfc7d3'
  on-secondary-fixed: '#141c25'
  on-secondary-fixed-variant: '#3f4751'
  tertiary-fixed: '#f6dfc0'
  tertiary-fixed-dim: '#d9c3a5'
  on-tertiary-fixed: '#251a06'
  on-tertiary-fixed-variant: '#53442d'
  background: '#131314'
  on-background: '#e4e2e3'
  surface-variant: '#353536'
typography:
  display-id:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
  label-xs:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.05em
spacing:
  unit: 4px
  container-padding: 12px
  gutter: 8px
  panel-gap: 1px
---

## Brand & Style
The design system is engineered for high-stakes, 24/7 border surveillance environments. The personality is authoritative, precise, and utilitarian, prioritizing situational awareness over aesthetic flair. 

The design style is a hybrid of **Modern Corporate** and **Technical Minimalist**, utilizing a "Glass-on-Obsidian" approach. It features deep-seated dark surfaces, microscopic precision in alignment, and a strict color-to-function mapping. Every pixel is dedicated to data transmission; decorative elements are eliminated to reduce cognitive load during high-stress monitoring.

## Colors
The palette is governed by a "Dark Operations" logic. The background is a near-black obsidian (#0B0F14) to minimize ocular strain in low-light command centers. 

Chromacity is reserved strictly for status communication:
- **Neutral/Surface**: Used for structural boundaries and inactive states.
- **Info**: A desaturated gray-blue for standard telemetry.
- **Warning/High/Critical**: A progression from amber to deep red. 
- **Critical Pulsing**: Elements tagged as Critical should employ a subtle 2px outer glow (`drop-shadow`) using the hex value with 40% opacity, pulsing at a 2-second interval.

## Typography
The system employs a dual-font strategy to separate narrative information from raw data.

- **Inter**: Used for interface controls, modal headers, and descriptive text. It provides the necessary legibility for "human" interaction.
- **JetBrains Mono**: The "Workhorse" font. Used for all coordinates, timestamps, vehicle IDs, and sensor readings. The monospace nature ensures that rapidly changing digits do not cause layout "jitter" (tabular lining).

Use `label-xs` for all secondary metadata to maximize the information density of dashboard widgets.

## Layout & Spacing
This design system utilizes a **Dense Modular Grid**. Unlike consumer apps, whitespace is treated as a loss of data-real-estate. 

- **The 4px Base**: All margins and paddings are multiples of 4px.
- **The 1px Separation**: Panels are separated by 1px solid borders (#232B34) rather than wide gutters. This creates a "monolithic" dashboard feel.
- **Reflow Logic**: On Desktop, panels are fixed-width sidebars with a fluid central map/video feed. On Tablet, sidebars collapse into "Drawer" overlays to maintain visibility of the primary surveillance theater.

## Elevation & Depth
Depth is signaled through **Tonal Stacking** rather than traditional shadows. 

- **Level 0 (Base)**: #0B0F14 - The main viewport/map background.
- **Level 1 (Surface)**: #141A21 - Secondary panels, sidebars, and header.
- **Level 2 (Active Container)**: #1C232B - Hover states or active selection within a panel.

**Outlines**: Use 1px solid borders (#232B34) for all containers. For high-priority alerts, the border color shifts to the status color (e.g., a Critical alert receives a 1px Red border).

## Shapes
The shape language is **Sharp (0px)**. 

To maintain a professional, military-grade aesthetic, avoid rounded corners on panels, buttons, and input fields. Right angles reinforce the "grid" and allow for seamless tiling of data modules. Small 45-degree chamfers are permitted on the corners of top-level "Active Mode" indicators to add a technical, machined look.

## Components

### Buttons & Controls
- **Primary**: Solid background (#232B34), Inter Bold, uppercase. No hover lift, only a subtle background brighten.
- **Action Icons**: 16px line icons centered in a 32x32px square. Use `stroke-width: 1.5`.

### Data Chips
- Small rectangular containers for tags (e.g., "DRONE-04", "SECTOR-B"). 
- Background: #1C232B; Text: JetBrains Mono 11px.

### Input Fields
- Flush containers with the surface background. 
- Bottom border only (1px solid #232B34) until focused. Focused state uses a 1px Info color border.

### Alert Cards
- High-density cards with a 4px left-accent bar indicating severity color.
- Critical alerts feature a "Scanline" overlay effect—a subtle, repeating horizontal pattern—to differentiate from static data.

### Video Feeds
- 1px interior border in Primary color.
- Overlay of coordinates (Data-Mono) in the top-right corner with 40% black background blur behind the text.