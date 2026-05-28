// ============================================================
// src/skin-versions.js
// ============================================================
// Central metadata for every released version of the AO3 Works
// master work skin. The editor's inline "skin status" pill and the Export
// modal read from this single source. The Export modal shows the current
// version, date, and `touches` note (edit `touches` manually per release).
//
// Schema for each entry:
//   version    — string, e.g. '1.29'. Matches the "Version:" line
//                in assets/master-skin.css.
//   date       — ISO date the version shipped.
//   label      — 'cosmetic' | 'bug-fix' | 'new-feature'
//                cosmetic    : visual polish; re-paste optional
//                bug-fix     : something now renders correctly
//                new-feature : a new block type was introduced
//   summary    — one-line description for the changelog.
//   touches    — optional plain-language note for the Export modal:
//                what surfaces/users should re-paste for (edit manually
//                on each release). Falls back to summary when omitted.
//   introduces — list of CSS classes that this version was the first
//                to ship. Used downstream to decide whether the user's
//                current chapter actually depends on a newer skin.
//                Empty array means "not attributed" (a safe default).
//
// API:
//   SKIN_VERSIONS         — array, newest first
//   CURRENT_SKIN_VERSION  — must equal the "Version:" line in
//                           assets/master-skin.css
//   classifyUpdate(installed) → { needsUpdate, severity, changesSince }
//
// Dual module: Node + browser (window.ao3worksSkinVersions).
// ============================================================

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ao3worksSkinVersions = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const SKIN_VERSIONS = [
    {
      version: '1.46',
      date: '2026-05-20',
      label: 'bug-fix',
      summary: 'Avatar photos — stretch flex frames with -hasimg so sl-av-* / dc-av-* color does not peek at edges; line-height:0 on .tw-avatar; explicit display:contents on <p> inside avatar shells when AO3 wraps imgs.',
      touches: 'Slack, Discord, Instagram, Gmail, Forum, and other skins when a message uses a profile photo — the colored initial should no longer show as a ring around the image. Twitter/X profile photos in the header.',
      introduces: [],
    },
    {
      version: '1.45',
      date: '2026-05-20',
      label: 'bug-fix',
      summary: 'Avatar images — override generic .responsive-img width/height:auto so *-avatar-img fills its frame in Slack and other skins.',
      touches: 'Any skin block with an uploaded avatar URL (Slack, Discord, Instagram, WhatsApp header, etc.) — photos should fill the avatar frame instead of shrinking.',
      introduces: [],
    },
    {
      version: '1.44',
      date: '2026-05-19',
      label: 'bug-fix',
      summary: 'Messenger composer bottom-anchor v2 — absolute positioning. v1.43 only fixed body-expand and only worked when frame height matched the body min-height. On real AO3, mobile/embedded contexts stretch frames taller and body-scroll variants were never patched, so composers still floated mid-frame. v1.44 pins the composer to the frame bottom with position:absolute + bottom:0 on the input-bar (frame becomes position:relative) and gives the body a padding-bottom equal to composer height so content can\'t slide under. Works for both body-expand and body-scroll across iMessage, WhatsApp, Snapchat, Slack, Android, Discord. AO3 sanitizer preserves position/top/right/bottom/left/padding-bottom.',
      introduces: [],
    },
    {
      version: '1.43',
      date: '2026-05-19',
      label: 'bug-fix',
      summary: 'Messenger composer bottom-anchor — short conversation variants (iMessage, WhatsApp, Snapchat, Slack, Android, Discord). The composer no longer floats mid-frame in short expand-mode chats; it now sits on the bottom rail. Achieved with body min-heights since AO3 strips flex-direction. No new selectors, no sanitizer warnings.',
      introduces: [],
    },
    {
      version: '1.41',
      date: '2026-05-19',
      label: 'bug-fix',
      summary: 'Reset to v1.31 known-good baseline. Versions 1.32–1.40 passed our pipeline tests but rendered incorrectly in actual AO3 across social media, reviews, and other surfaces. Returning to proven ground and re-introducing each feature deliberately with on-AO3 visual review.',
      introduces: [],
    },
    {
      version: '1.31',
      date: '2026-05-18',
      label: 'bug-fix',
      summary:
        'Combined fix — WhatsApp mobile min-width 360→320 (carried from v1.30) + flex-longhand rewrite so AO3 sanitizer no longer strips the flex shorthand across iMessage, Snapchat, Android, Discord, Slack, Tweet, Letter, Tumblr, Newspaper, Forum, Facebook, Instagram, Bluesky, Review, Gmail blocks.',
      introduces: [],
    },
    {
      version: '1.30',
      date: '2026-05-18',
      label: 'cosmetic',
      summary: 'WhatsApp mobile fit — drop min-width 360→320 to fit narrow AO3 viewports.',
      introduces: [],
    },
    {
      version: '1.29',
      date: '2026-05-16',
      label: 'cosmetic',
      summary: 'Letter, Newspaper, Sticky color parity with editor canvas.',
      introduces: [],
    },
    {
      version: '1.28',
      date: '2026-05-12',
      label: 'bug-fix',
      summary: 'Editor preview now renders through sanitizer + AO3 baseline — true WYSIWYG.',
      introduces: [],
    },
    {
      version: '1.27',
      date: '2026-05-08',
      label: 'bug-fix',
      summary: 'Snapchat case-3 fix; dropped prefers-color-scheme blocks to fix OS-dark / AO3-light edge case.',
      introduces: [],
    },
    {
      version: '1.26',
      date: '2026-05-05',
      label: 'bug-fix',
      summary: 'AO3 sanitizer compatibility; Snapchat yellow header; Newspaper light; Sticky dark softened.',
      introduces: [],
    },
    {
      version: '1.25',
      date: '2026-05-01',
      label: 'bug-fix',
      summary: 'AO3 sanitizer compatibility — inline var() values, drop :root, replace calc() in Snapchat.',
      introduces: [],
    },
    {
      version: '1.24',
      date: '2026-04-26',
      label: 'cosmetic',
      summary: 'Snapchat redesign for real-app fidelity; AO3 fic card removed; CSS variables + dark-mode support.',
      introduces: [],
    },
    {
      version: '1.18',
      date: '2026-04-12',
      label: 'cosmetic',
      summary: 'Hide AO3-injected br in Snapchat composer strip, Tumblr thread/nests, AO3 blurb card.',
      introduces: [],
    },
    {
      version: '1.17',
      date: '2026-04-08',
      label: 'cosmetic',
      summary: 'Robust export alignment; Tumblr thread + AO3 blurb card; explicit component margins.',
      introduces: [],
    },
    {
      version: '1.16',
      date: '2026-04-05',
      label: 'cosmetic',
      summary: 'Prose lists + avatar margin-right; Tumblr + AO3 blurb redesign.',
      introduces: [],
    },
    {
      version: '1.15',
      date: '2026-04-02',
      label: 'cosmetic',
      summary: 'AO3 parser spacing patch (superseded by 1.16).',
      introduces: [],
    },
    {
      version: '1.14',
      date: '2026-03-29',
      label: 'cosmetic',
      summary: 'Export HTML minified; hide AO3-injected <br> inside flex rows.',
      introduces: [],
    },
    {
      version: '1.13',
      date: '2026-03-25',
      label: 'cosmetic',
      summary: 'Consolidated AO3 <p> neutralizer; preserves composer draft overrides.',
      introduces: [],
    },
    {
      version: '1.12',
      date: '2026-03-21',
      label: 'bug-fix',
      summary: 'AO3 skin save — remove gap/calc/object-fit; iMessage and WhatsApp header spacing fixes.',
      introduces: [],
    },
    {
      version: '1.11',
      date: '2026-03-18',
      label: 'cosmetic',
      summary: 'Discord avatar backgrounds scoped; review avatar contrast; Newspaper rule line.',
      introduces: [],
    },
    {
      version: '1.10',
      date: '2026-03-15',
      label: 'cosmetic',
      summary: 'Snapchat saved-pill borders and rail alignment polish.',
      introduces: [],
    },
    {
      version: '1.9',
      date: '2026-03-11',
      label: 'cosmetic',
      summary: 'Snapchat outgoing rail; Android green bubbles; Tumblr reblog stair-step; avatar URL + initial fallbacks.',
      introduces: [],
    },
    {
      version: '1.8',
      date: '2026-03-07',
      label: 'cosmetic',
      summary: 'Snapchat / Android / Slack / Discord scroll vs expand body, typing row, composer draft strip.',
      introduces: [],
    },
    {
      version: '1.7',
      date: '2026-03-03',
      label: 'new-feature',
      summary: 'Tweet action bar + views/bookmarks; Instagram carousel; Discord reply preview; Reddit card; Tumblr reblog.',
      introduces: ['tw-bar-btn', 'ig-carousel-dots', 'dc-reply', 'rd-card', 'tm-reblog'],
    },
    {
      version: '1.6',
      date: '2026-02-27',
      label: 'cosmetic',
      summary: 'Snapchat status rows; .sc-meta inside .sc-image-container; legacy selectors retained.',
      introduces: [],
    },
    {
      version: '1.5',
      date: '2026-02-23',
      label: 'cosmetic',
      summary: 'iMessage expand mode — .ios-body flex-grow so composer stays at bottom.',
      introduces: [],
    },
    {
      version: '1.4',
      date: '2026-02-19',
      label: 'cosmetic',
      summary: 'iMessage composer min-height + flex; pill no longer collapses.',
      introduces: [],
    },
    {
      version: '1.3',
      date: '2026-02-15',
      label: 'cosmetic',
      summary: 'iMessage <p> margins inside .ios-phone.',
      introduces: [],
    },
    {
      version: '1.2',
      date: '2026-02-11',
      label: 'new-feature',
      summary: 'iMessage + initial skin set; AO3 <p>-in-widget neutralizer; div bubbles.',
      introduces: ['ios-phone', 'ios-msg'],
    },
    {
      version: '1.1',
      date: '2026-02-07',
      label: 'cosmetic',
      summary: 'AO3 work-skin sanitizer compatibility — no gap / min() / animation.',
      introduces: [],
    },
  ];

  const CURRENT_SKIN_VERSION = '1.46';

  function formatSkinReleaseDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
    const parts = iso.split('-').map((n) => parseInt(n, 10));
    return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function releaseTouchesText(entry) {
    if (!entry) return '';
    const t = entry.touches != null ? String(entry.touches).trim() : '';
    if (t) return t;
    return entry.summary != null ? String(entry.summary).trim() : '';
  }

  function getCurrentSkinRelease() {
    return SKIN_VERSIONS[0] || null;
  }

  // Numeric severity for comparison. Higher = more urgent.
  const SEVERITY_RANK = { none: 0, cosmetic: 1, 'bug-fix': 2, 'new-feature': 3 };

  function compareVersions(a, b) {
    const pa = String(a).split('.').map((n) => parseInt(n, 10));
    const pb = String(b).split('.').map((n) => parseInt(n, 10));
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const ai = pa[i] || 0;
      const bi = pb[i] || 0;
      if (ai !== bi) return ai - bi;
    }
    return 0;
  }

  function classifyUpdate(installedVersion) {
    if (installedVersion == null) {
      return { needsUpdate: false, severity: 'none', changesSince: [] };
    }
    if (compareVersions(installedVersion, CURRENT_SKIN_VERSION) >= 0) {
      return { needsUpdate: false, severity: 'none', changesSince: [] };
    }
    const changesSince = SKIN_VERSIONS.filter(
      (entry) =>
        compareVersions(entry.version, installedVersion) > 0 &&
        compareVersions(entry.version, CURRENT_SKIN_VERSION) <= 0
    );
    if (changesSince.length === 0) {
      return { needsUpdate: false, severity: 'none', changesSince: [] };
    }
    let worst = 'cosmetic';
    for (const entry of changesSince) {
      if (SEVERITY_RANK[entry.label] > SEVERITY_RANK[worst]) worst = entry.label;
    }
    return { needsUpdate: true, severity: worst, changesSince };
  }

  return {
    SKIN_VERSIONS,
    CURRENT_SKIN_VERSION,
    classifyUpdate,
    compareVersions,
    formatSkinReleaseDate,
    releaseTouchesText,
    getCurrentSkinRelease,
  };
});
