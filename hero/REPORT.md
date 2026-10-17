# Scripbox PMS Landing Page — Investment Strategy Cards Component Redesign Report
## Reworked Component Architecture: Restored Hierarchy, Connected Icons, Deliberate Visuals & Structured Progressive Disclosure

---

## 1. Executive Summary & Design System Rework

Following specific critique that the previous pass over-flattened styling into unformatted document blocks rather than designed components, a comprehensive component rework was executed across all three investment strategy cards:

1. **Restored Visual Hierarchy:**
   - Clearly separated four distinct structural levels:
     - **Level 1 (Category Badge):** Dignified uppercase badge (`QUANT EQUITIES`, `DIRECT FUND MANDATE`, `CONCENTRATED EQUITY`) with warm amber hairline styling.
     - **Level 2 (Title Row with Connected Icon):** Tailored SVG icon in a dedicated 40×40px container visually anchored directly beside the strategy name (`Optimiser Portfolio`, `Select Direct Growth Portfolio`, `Focused Leadership Portfolio`).
     - **Level 3 (Concise 1-Sentence Description):** Single-sentence, plain-English mandate explanation with 15px body typography and comfortable 1.55 line height.
     - **Level 4 (Deliberate Visual Explanation):** A structured visual component engineered for each mandate.

2. **Reduced Visible Content (Default State):**
   - The default state displays **only**: (1) Strategy name with connected icon & category badge, (2) One-sentence explanation, (3) One meaningful visual component, (4) Three essential metadata fields, and (5) The collapsed accordion button.
   - **Zero redundant bullets**, lead-thesis quotes, or multi-paragraph marketing blocks in the default state.

3. **Collapsed Details by Default:**
   - All three accordions initially closed and labelled **`Explore strategy details`** (`aria-expanded="false"`, `hidden` attribute).
   - Toggling smoothly opens the accordion and dynamically updates the label to **`Hide strategy details`** with a flipped chevron.
   - Expanded content is strictly structured into **Investment Framework** (bulleted core pillars) and **Operational Mechanics** (spec rows for custody, rebalancing, and reporting).

4. **Restored Deliberate Visual Explanations:**
   - **Optimiser Portfolio:** The **4-Factor Quantitative Framework** rendered as a deliberate 2x2 matrix with glowing indicators, parameter definitions (`Momentum: Trend persistence`, `Quality: Capital efficiency`, `Value: Earnings yield`, `Low Volatility: Downside resilience`), and a cycle-aware active rebalancing caption.
   - **Select Direct Growth:** The **75:25 Structural Allocation Blueprint** rendered as a proportional progress track (75% Core Equity amber fill vs 25% Tactical satellite), dual legend callout cards, and an institutional direct-fund cost advantage caption.
   - **Focused Leadership:** The **Concentrated Moat Visualizer** rendered with dual metric cards (**15–20** *Market Leaders (Max 20)* vs **1–3 Yrs** *Catalyst Horizon*), a non-dilution discipline banner, and a core operating dominance caption.

5. **Unified Design System:**
   - Consistent typography (`Area Normal` / `Helvetica Neue` / system-ui), consistent spacing, component hierarchy, and restrained Scripbox warm amber (`#F58024`) accents.
   - Cards are visually distinctive through their **content and bespoke visual components**, not through arbitrary clashing colors.

6. **Preserved Content Responsibly:**
   - Mandate theses, factor scoring philosophies, direct-fund commission savings, and segregated Demat custody terms were moved into the expanded drawer.
   - Strictly zero deleted material information, and zero invented performance claims.

---

## 2. Multi-Viewport Automated Browser Validation (`test-cards-validation.js`)

Automated Chrome DevTools Protocol (CDP) test execution across mobile (`390 × 844px`) and desktop (`1280 × 800px`):

| Test Suite | Metric / Assertion | Expected | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Card Count** | Total strategy cards | 3 cards | 3 cards | **PASS** |
| **Visual Hierarchy** | Connected icon in title row | Present on all 3 | Present on all 3 | **PASS** |
| **Default Accordion State** | Closed by default | All closed | All closed (`hidden=true`, `aria-expanded="false"`) | **PASS** |
| **Default Accordion Label** | Button text | "Explore strategy details" | "Explore strategy details" | **PASS** |
| **Dynamic Toggle Label** | Button text on click | "Hide strategy details" | "Hide strategy details" | **PASS** |
| **Default Visible Bullets** | Bullets in default state | 0 | 0 | **PASS** |
| **Essential Metadata** | Fields per card | Exactly 3 | Exactly 3 | **PASS** |
| **Visual Components** | Bespoke container present | All 3 cards | All 3 cards | **PASS** |
| **Mobile Overflow** | `scrollWidth` vs `clientWidth` (390×844) | `scrollWidth <= 390px` | `390px = 390px` (0px overflow) | **PASS** |
| **Tap Target Floor** | Interactive controls &ge; 44×44px | 100% compliant | Pills: 44px min-height; Drawers: 44px min-height | **PASS** |
| **Typography Floor** | No sub-12px text, body &ge; 15px | 100% compliant | 0 sub-12px elements; body copy &ge; 15px | **PASS** |

---

## 3. Generated Visual Verification Screenshots

All captured screenshots are saved in `hero/shots/` and mirrored in the artifact directory:

1. `mobile-card-strat-optimiser-closed.png` — Optimiser Portfolio (Reference Implementation, closed state).
2. `mobile-card-strat-optimiser-open.png` — Optimiser Portfolio (Expanded drawer showing Investment Framework & Operational Mechanics).
3. `mobile-card-strat-direct-growth-closed.png` — Select Direct Growth Portfolio (75:25 blueprint, closed state).
4. `mobile-card-strat-direct-growth-open.png` — Select Direct Growth Portfolio (Expanded drawer showing direct fund mechanics).
5. `mobile-card-strat-focused-closed.png` — Focused Leadership Portfolio (15–20 concentrated moat, closed state).
6. `mobile-card-strat-focused-open.png` — Focused Leadership Portfolio (Expanded drawer showing catalyst milestone tracking).
7. `desktop-strategies-closed-1280x800.png` — Desktop viewport rendering (1280 × 800px).
