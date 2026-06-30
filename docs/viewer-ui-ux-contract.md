# Viewer UI/UX Contract

This repository has a pre-existing Fable-built viewer UI. The Fable viewer is the visual and UX baseline.

For any task touching files under `viewer/`, obey these rules.

## 1. Preserve The Fable UI

Do not replace the existing viewer shell with a plain HTML/report/audit page.

The following elements must remain unless the user explicitly requests a redesign:

- masthead;
- sidebar navigation;
- central workspace;
- inspector panel;
- card-based layout;
- existing typography;
- existing colour palette;
- existing spacing rhythm;
- existing badges;
- existing `styles.css` design tokens.

The original viewer is the product shell. New features must be integrated into it.

## 2. No Raw Audit-Page Demos

Never make a boss/VC demo look like:

- raw markdown dump;
- JSON dump;
- giant report page;
- dense table wall;
- unstyled compliance checklist;
- basic HTML page;
- source links without visual context.

Legal safety information must be shown through compact badges, source panels, collapsible audit sections, and readable cards.

## 3. Verified Demo Integration Rule

If adding verified case-law demo material, add it as one of:

- a first-class sidebar view inside the existing viewer;
- a polished card/module inside the existing workspace;
- a direct route that visually matches the existing viewer.

Do not replace `/viewer/` with a standalone raw demo unless explicitly instructed.
Do not iframe a separate proof page as the main solution. The primary `/viewer/` experience must render verified evidence natively through the existing workspace cards, inspector, badges, and source panels.

## 4. Legacy Graph Labelling Rule

If the old graph/domain map is unverified, label that data precisely:

> Legacy seed graph - not the source-proofed case-law demo.

Do not label the whole product UI as obsolete if the shell is still the correct UI.

## 5. Demo Readability Rule

A boss/VC demo page must be understandable within 30 seconds.

Required layout:

- hero card with product claim and metrics;
- query tabs or cards;
- answer/memo panel;
- source-proof authority cards;
- exact quote panel;
- HKLII/LegalRef links;
- compact legal boundary badges;
- collapsed technical audit details.

## 6. Required Legal Badges

Every paragraph-linked legal demo must visibly include clean prototype labels:

- Source-linked;
- Public judgment;
- Paragraph proof;
- Research prototype;
- professional_advice_certified=false, only as quiet metadata or compact audit copy.

Do not show per-card labels such as `Verification pending`, `Source check pending`, `Human review required`, `Lawyer review required`, `Not answer safe`, `Case audit required`, or `answer_safe=false`.

## 7. Visual Quality Gate

Before finishing any viewer task, check:

- `/viewer/` still looks like the original polished workspace;
- new feature is easy to find;
- no raw JSON is visible as main content;
- no giant markdown wall is visible as main content;
- no iframe is used as the primary verified demo inside `/viewer/`;
- source links and quotes are readable;
- layout is readable at desktop width;
- old graph is labelled accurately if unverified.

If the implementation would look worse than the original Fable UI, stop and report instead of pushing.

## 8. Tests/Checks

For viewer changes, run or create checks that verify:

- original shell elements still exist;
- sidebar exists;
- inspector exists;
- Verified Case Demo entry exists if relevant;
- HKLII/LegalRef links exist in verified demo;
- paragraph anchors exist where expected;
- exact quote labels exist;
- clean Source-linked/Public judgment/Paragraph proof/Research prototype labels are visible;
- unsupported query abstention is visible;
- raw JSON is not exposed as primary UI.
- iframe-based proof-page embedding is absent from the main `/viewer/` demo.

Current PR #6 viewer checks:

```bash
node scripts/validate_public_demo_source_links.js
node scripts/smoke_test_viewer_ui_quality.js
```

## 9. Commit Rule

Do not claim "UI fixed" unless the preview URL has been opened or smoke-tested and the page is visually acceptable against the Fable baseline.
