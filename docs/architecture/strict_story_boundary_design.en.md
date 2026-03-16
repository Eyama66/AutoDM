# AutoDM Strict Story Boundary Design

This document defines how AutoDM should support two goals at the same time:

1. The DM should tell a natural, compelling story
2. Story facts must stay inside module data and authoritative runtime state

AutoDM is treated as a long-term **TRPG engine**, not just a web demo. The design assumes:

- larger modules
- multiple regions and plot lines
- solo and party play
- pluggable modules
- long sessions with recoverable state

The Chinese version is `docs/architecture/strict_story_boundary_design.md`.

---

## 1. Design Goal

The target is **narrative freedom, factual closure**:

- the AI may vary tone, pacing, dialogue, and scene framing
- the AI may not invent locations, exits, NPCs, items, encounters, or plot progression rules

In short: **wording may be flexible, facts may not be**.

---

## 1.1 Current Boundary: Frontend First, Backend Later

At the current stage, the browser is used to finish a stable golden-path module run. The frontend is responsible for:

- prompt/context contracts
- UI and message transport
- local mock and shadow runtime behavior
- local golden-path resolution for a limited set of actions

The backend will later own:

- authoritative intent adjudication
- authoritative session runtime
- state mutation and event storage
- multiplayer session coordination and persistence

In short: **the frontend currently owns flow and UX; the backend will eventually own truth**.

---

## 1.2 Current Frontend Runtime (Implemented)

One clarification is important:

- this is the **current frontend implementation strategy**, not the final AI role model
- the current browser-first slice temporarily pushes AI toward a narrower narrator role so the golden path can be stabilized
- the long-term target is still a constrained **curator** model: AI decides what should happen next, but only inside a system-built possibility space

The current implemented runtime looks like this:

```text
React UI
  -> InteractionFooter / free text input
  -> Turn Intent Runtime (golden path only)
  -> CampaignManager
  -> PromptContext Builder
  -> AI Narrator
```

Current responsibilities:

- `InteractionFooter / free text input`
  - exposes structured scene options plus free text
- `Turn Intent Runtime`
  - performs minimal local resolution for `move / talk / inspect / loot`
  - applies deterministic actions before narration
- `CampaignManager`
  - acts as the local authoritative runtime for now
  - validates `MOVE / ITEM_ADD / COMBAT_START / PLOT_UPDATE`
- `PromptContext Builder`
  - assembles scene authority, plot frontier, and player state
- `AI Narrator`
  - narrates already-resolved outcomes
  - may still propose the next beat, such as a check or combat start

Current implemented properties:

- structured scene options can drive a single-module golden path
- locally resolved actions are applied before narration
- repeated loot from the same scene is blocked by a scene-level claim ledger
- UI-facing session derivations are being consolidated instead of scattered across components

Current limitations:

- the browser is still the temporary runtime authority
- open-ended intent adjudication is not backend-owned yet
- multiplayer, replay, and durable server persistence are not implemented yet

So `§1.2` describes the current tactical implementation, while the later architecture sections describe the long-term target model.

---

## 1.3 Frontend Golden-Path Rule

The frontend golden path follows this turn order:

```text
Scene Options / Player Input
  -> TurnIntent
  -> Local TurnResolution
  -> Apply deterministic actions locally
  -> System Directive / Narration Packet
  -> AI Narrator
```

This rule matters:

- already-applied local actions must not be executed again by AI output
- however, AI follow-up actions for the **next beat** must still be allowed

That prevents two common failure modes:

1. the AI repeats a resolved `MOVE` or `ITEM_ADD`
2. the frontend suppresses legitimate follow-up actions such as `CHECK`, `COMBAT_START`, or `PLOT_UPDATE`

---

## 2. Current System Gaps

AutoDM already has a strong base:

- prompt-based scene constraints
- action-level guards
- a `CampaignManager` pipeline for proposal -> validation -> state update

But several gaps still exist:

1. **Text facts are weaker than action facts**
   - narrative hallucinations are still harder to control than explicit action tags
2. **Plot progression is not a complete state machine yet**
   - plot data is improving, but not yet fully authoritative
3. **Context assembly is still local and browser-oriented**
   - large modules will require retrieval-based context assembly
4. **Long-session and multiplayer infrastructure is incomplete**
   - there is no real event-sourced backend session runtime yet

---

## 3. Core Design Principles

Future work should follow these rules:

1. **AI never owns world truth**
2. **Modules should be compiled before runtime**
3. **Use small context with hard authority**
4. **Prefer deterministic rules, use LLM validation only as a fallback**
5. **Use one runtime model for solo and party play**
6. **Use a closed world for facts, but an open world for tactics**

That last rule matters:

- the system should strongly constrain hard facts, forbidden facts, blockers, and critical scripted triggers
- the system should **not** try to enumerate every valid player tactic
- AI should still adjudicate unlisted tactics, as long as they do not violate world facts and can plausibly satisfy the required outcome

In short: **strongly constrain outcomes, weakly constrain paths**.

---

## 4. Target Full-Stack Architecture

The long-term target is:

```text
Client (Web)
  -> Session Gateway
    -> Session Runtime
      -> Rules Kernel
      -> Event Store / Persistence
      -> Context Assembler
      -> Memory / Summary Pipeline
      -> AI DM Adapter
```

Responsibilities:

- `Client`
  - renders UI, submits intents, shows narration and system results
- `Session Gateway`
  - handles transport, subscriptions, and room/session boundaries
- `Session Runtime`
  - owns the authoritative state and turn orchestration
- `Rules Kernel`
  - validates and applies moves, checks, combat, conditions, rewards, and plot changes
- `Event Store / Persistence`
  - stores events, snapshots, and summaries
- `Context Assembler`
  - builds prompt packets from authoritative state
- `Memory / Summary Pipeline`
  - compresses long-session history into reusable summaries
- `AI DM Adapter`
  - handles prompts, model calls, and parsing, but not final authority

To keep implementation responsibilities explicit, use this ownership model:

| Layer | Responsibility | Single source of truth |
|---|---|---|
| `World Authority Store` | compiled world facts, rules, scene/plot/entity/trigger indexes | yes |
| `AuthorityPacket` | per-turn projection of the current authoritative facts | no |
| `possibilitySpace` | the subset of currently legal engine-level deployments exposed to AI | no |

Clarification:

- `possibilitySpace` is **not** a complete list of every legal tactic
- it constrains engine-relevant proposals such as encounter deployment, item discovery, and plot advancement
- tactics outside that list may still be adjudicated by AI, then validated against hard facts and outcome predicates

---

## 5. Action Plan

### Phase A: Frontend Golden Path

- keep tightening structured scene options
- keep deterministic local resolution narrow and explicit
- continue reducing message-derived UI logic

### Phase B: Backend Contracts

- stabilize `IntentAdjudication`, `AIProposal`, `EngineEvent`, and `ContextPacket`
- move authoritative adjudication and state mutation behind a server boundary

### Phase C: Full Runtime Migration

- move session authority to backend runtime
- add multiplayer sessions, replay, and persistence
- switch the frontend from local authority to gateway-driven snapshots and events

---

## 6. Practical Standard

For the near term:

- the frontend should be able to run a module to completion on a stable golden path
- the backend should later absorb open-ended adjudication and edge cases

That is the correct order for AutoDM right now.

---

## 7. Current Prototype Assessment

The current prototype already demonstrates:

- compiled authority for scene, plot, entity, and trigger data
- `possibilitySpace` passed into prompt/context and validator logic
- retry correction that includes the previous invalid assistant reply
- a first trigger pipeline: `check result -> activeTrigger -> narrowed possibilitySpace`

The current prototype is **not** fully closed yet. The main remaining gaps are:

- runtime guards for plot and item updates are not fully trigger-aware yet
- trigger lifecycle, persistence, and cleanup are incomplete
- some text-level drift checks still rely on heuristics

So the current state is sufficient as a **frontend prototype that validates direction**, but not yet as a **fully authoritative and recoverable production runtime**.
