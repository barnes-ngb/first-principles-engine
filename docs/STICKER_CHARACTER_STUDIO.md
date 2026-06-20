# Sticker / Character Studio — Design Spec

**Version:** v0.1 — June 19, 2026 (design capture; build is July+, operate-mode holds through June 30)
**Status:** Concept captured; July creation-layer thread. Ledger: **FEAT-33**.
**Relationship:** Upstream creation surface. Pulls sticker/character creation *out* of the book
editor into a standalone tool that books, stories, and the business tab all draw from. Related:
**FEAT-28** (themes/house style) and `BUSINESS_TAB_DESIGN.md` (its sticker composer draws from here).

## Problem

Sticker/character creation is currently buried inside the book editor — one consumer owns the
creation tool. It's hard to find, overwhelming to edit, and unavailable to other surfaces (stories,
business).

## Concept

A standalone **Studio** — the upstream place stickers and characters get *made*, decoupled from any
single consumer. Core flows:
- **Sketch → sticker:** photograph a drawing → transparent sticker (reuses sketch-to-story +
  sticker-gen).
- **Scene → extract characters later:** generate full scenes (background art), then pull characters
  and elements out of those scenes as stickers afterward. This is already how a generated book works
  — its scenes are full of extractable characters (Sunny's book is the proof).
- **Organized library:** browse, tag, group, and edit stickers/characters in a calm,
  non-overwhelming surface — not crammed into the editor. Per-child + shared.

## Consumers

- **Books / stories** — drop stickers and characters into pages.
- **Business tab** — the sticker-sheet composer (`BUSINESS_TAB_DESIGN.md`) draws from the Studio's
  library; products reference Studio assets.
- **Kids directly** — Lincoln and London make stickers to use anywhere.

## What it reuses

Sketch-to-story pipeline, sticker generation (`gpt-image-1.5` transparent), Sticker Library, and
scene generation. The Studio is a **re-home + organization layer** over existing creation tech — not
new generation.

## House style

Cartoon, generalized (see FEAT-28) — consistent across stickers/characters for brand recognition and
cheaper print reproduction.

## Roles & curriculum

Creation stays loose between the boys (London draws/invents upstream, Lincoln pulls assets into
products). Studio work logs as Art via the creative timer.

## Sequencing (July)

Decouple creation from the editor → standalone Studio shell + organized library → scene-to-character
extraction → wire consumers (books, business composer). Stacks alongside the business-tab and theme
work.

## Operate-mode note

Captured June 19 during operate-mode (no app features until July 1). Build July; tracked as FEAT-33.
