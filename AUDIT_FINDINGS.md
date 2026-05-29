# Threnne — Three-Site Audit Findings

Scope: All 24 mockup pages across **threnne** (studio), **romancesignal** (research wing), and **ao3works** (editor tool), reviewed for (1) copy, (2) design & formatting, and (3) cross-site connectivity & brand accuracy. Audit run against the locally served build with the brand refresh applied (branch `brand-refresh`).

> Note on sequencing: the brand-token / mark / favicon refresh has already been applied and committed to `brand-refresh`. This audit is the page-by-page pass that follows. Findings below are about *page content and wiring*, not the token refresh (which is done and verified).

---

## Verdict at a glance

The brand refresh landed cleanly — every content page renders with the new palette, the marks/favicons are correct, and accent restraint matches the brand guide. The pages themselves are well-written and well-composed; **the romancesignal book-detail pages and the Heated Rivalry case study are the strongest work in the set.**

The problems are almost entirely in **wiring and naming**, not visual design. The single highest-impact cluster is on the **threnne home page**, where the product cards don't link to the products they describe. There is also one piece of **documentation rot** (the RS design-system page describes a superseded brand) and a set of **broken book-detail links**.

---

## CRITICAL — fix before any public/stakeholder view

### C1. threnne home: product cards link to the wrong place
On `threnne/index.html`, **every product CTA points to `./exchange`** — none route to the product the card is about:

| Card | CTA label | Current target | Should target |
|---|---|---|---|
| Romance Signal | "Read Volume 01 →" | `./exchange` | romancesignal research / Volume 001 |
| AO3 Studio | "Try the builder →" | `./exchange` | ao3works editor |
| The Exchange | "How it works →" | `./exchange` | ✅ correct |

The romancesignal site *already* links its own "Read Volume 001 →" to `./research/volume-001/index.html`, so the correct target exists — the studio page just points everything at the waitlist. This makes the studio's three flagship cards feel like dead ends.

### C2. Product naming mismatch: "AO3 Studio" vs "AO3 Works"
The threnne home calls the tool **"AO3 Studio"** ("A workskin builder for AO3"). The tool itself brands as **"AO3 Works."** everywhere on its own site (title, wordmark, modals, copy). Same product, two names. Pick one (the tool's own site consistently says "AO3 Works.") and make the studio match.

### C3. Broken book-detail links (5 of 6 on the watchlist)
The watchlist index links **all 6 book rows** to detail pages, but only `heated-rivalry/` exists. These 5 are 404s:
`in-her-own-league`, `last-first-kiss`, `get-over-it-april-evans`, `a-vow-in-vengeance`, `modern-divination`.

The RS **home page** also links "Full breakdown →" for *In Her Own League* and *Last First Kiss* — both broken. Either build the pages, or disable/relabel the links until the cohort pages exist (the testing banner sets the expectation, but live links shouldn't 404).

---

## SHOULD-FIX — correctness & consistency

### S1. RS design-system page documents a *superseded* brand ("documentation rot")
`romancesignal/design-system.html` is titled "THE ROMANCE LEDGER" and describes a **"CoinMarketCap-inspired"** system that contradicts the current Threnne brand guide:
- **Wrong fonts:** declares Display = **Satoshi**, Body = **Inter** (loads Satoshi from Fontshare). The brand guide and every live page use **Hanken Grotesk**.
- **Wrong palette:** shows `--color-primary/violet/blue/cyan/amber/mint/up/down` — a multi-color crypto-dashboard set, not the restrained pink/acid/teal wayfinding system.

Good news: the **live RS pages do NOT use these tokens** (0 references) and load Hanken Grotesk correctly — so this is stale *documentation*, not a live styling problem. But the hub links this page as the "Component reference," so anyone using it as the source of truth would be misled. Update it to reflect the real Hanken-Grotesk / pink-acid-teal system, or remove it.

### S2. "by Threnne" on romancesignal links to itself
On `romancesignal/index.html`, the brand lockup "Romance Signal **by Threnne**" links to `./index.html` (its own home). The `aria-label` even says "…by Threnne home." It should link to the Threnne studio site. ao3works does this correctly (`https://threnne.com`).

### S3. Cross-site linking is asymmetric / incomplete
The "studio ↔ products" graph has holes:
- **threnne** → links to `romancesignal.com` (footer) but **never links to ao3works** anywhere.
- **romancesignal** → links **out to nothing** (its only "up" link is the broken self-link in S2).
- **ao3works** → correctly links up to `threnne.com`.

Decide on a consistent pattern (every child links up to the studio; the studio links down to each product) and apply it across all three.

### S4. Domain architecture undecided: subdomains vs standalone
The **brand guide** specifies subdomains — `signal.threnne.com`, `works.threnne.com`. The **actual links + hub labels** use standalone domains — `romancesignal.com`, `ao3works.com`. These can't both be canonical. Pick the live convention and align the brand guide (or vice-versa). This is the same domain inconsistency flagged during the brand vetting round.

---

## POLISH — nice-to-have

### P1. App-chrome accent colors not in the core palette
A few app/system colors sit outside the documented pink/acid/teal + grounds:
- ao3works editor: deep-burgundy tour banner, acid-tinted "THEME/Tour" chips, acid primary buttons in modals.
- RS methodology: green "LIVE" / amber "CALIBRATING" status badges.

None are *wrong* for transient app chrome / status semantics, but they aren't documented. Consider formalizing a small **"system / status" sub-palette** in the brand guide (success/warning/live/testing) so these read as intentional rather than ad-hoc. (The violet "mockup-banner" is dev scaffolding — ignore it; it won't ship.)

### P2. Eased-acid not yet applied to ao3works modal/editor buttons
The eased acid (`#C4D93A`) was applied to the token system, but some ao3works in-app buttons still render the older brighter lime. Confirm those pull from the shared token rather than a local hard-coded value.

### P3. Home CTA label vs page CTA label
threnne home header CTA says "Stay in touch"; exchange header says "Join waitlist." This is fine (contextual), just noting it's intentional so it doesn't get "fixed" by accident.

---

## What's working well (keep)
- **Visual design & brand application** across all content pages — palette, restraint, marks, favicons all correct post-refresh.
- **romancesignal/watchlist/heated-rivalry** and **research/volume-001** — chart-rich, precise, educational copy. Best pages in the set.
- **Voice consistency** — "Slow, careful, curious." (threnne) carries through to RS's "working on the answer in public" and ao3works's "A gift, for the people writing our favorite characters." Cohesive across three sites.
- **Dark-mode acid** now reads correctly (validated on RS dark-theme state) — the eased-acid change did its job.
- **ao3works disclaimer** ("We're not affiliated with AO3 or the OTW") — important and well-placed.
</content>
