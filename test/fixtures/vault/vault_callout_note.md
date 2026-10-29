---
aliases: []
tags: []
type: project
status: active
---
# Product Requirements Document (PRD)
## Obsidian Vault Information Architecture & Agent Skill Repository

**Project**: Vault Refactor & Canonical Skill Repository  
**Location**: `40_Projects/Vault_Refactor_And_Skills_Repo/01_Project_PRD.md`  
**Status**: Approved (Revision 2 — Post-Audit)  
**Author**: Antigravity Pair Programmer  
**Revision Date**: 2026-08-28  

---

## 1. Problem Statement

The Obsidian vault currently suffers from structural drift, semantic overlap, inconsistent naming schemas, and fragmented agent configuration files. Specifically:
- **Rule Ambiguity**: There is no deterministic decision framework for where a note belongs (e.g., choice between `00_Inbox`, `10 - Notes`, `20_Knowledge`, `50_Wiki`, `00_System/Memory/Learnings`).
- **Naming Inconsistencies**: Mixed naming conventions exist simultaneously (e.g., `10 - Notes` vs. `10_Daily`, `90 - Archive` vs. `90_Archive`).
- **Skill Fragmentation**: Agent skills are scattered across `00_System/Skills/` without a runtime-friendly structure, lacking a portable distribution model.
- **Missing LLM Wiki**: The vault has no first-class location for agent-maintained knowledge that is separate from the user's personal PKM notes. Agent-generated research and synthesis pollutes human-curated knowledge.

---

## 2. Current-State Findings Summary

From the Phase 0 audit of 5,095 total files (254 `.md` notes, 4,841 attachments):
- **21 Empty Directories**: Includes abandoned structures (`40_Projects/AAA`, `.agents/`) and architectural placeholders (`30_Pipeline/04_Scheduled`, `20_Knowledge/Competitor_Analysis`).
- **Duplicate Categories**: Parallel archives (`90 - Archive` vs `90_Archive`) and parallel trashes (`Trash/` vs `.trash/`).
- **Fragmented Daily Notes**: `10_Daily/`, `00_System/Memory/Daily_Logs/`, and `90_Archive/_old_vault/20 - Daily Notes/`.
- **Frontmatter Gaps**: Only 38% of notes currently have YAML frontmatter.
- **Case-Duplicate Subdirectories**: `20_Knowledge/` contains both `Concepts/` and `concepts/`, `Entities/` and `entities/`.
- **Root-Level Loose Files**: `AGENT.md`, `Kitty Terminal.md`, `README.md`, `Obsidian Refactor Prompt.md`, and 5 Python utility scripts sit at vault root with no classification.

---

## 3. Goals

1. **Deterministic Architecture**: Establish a strict top-level structure where every file's placement is determined by unambiguous rules.
2. **Portable Agent Skills**: Create a `.agent/` directory with general and agent-specific skill sub-folders, distributable via OS-level symlinks — zero custom sync tooling.
3. **LLM Wiki Separation**: Provide a dedicated `70_Wiki/` top-level folder for agent-maintained knowledge, fully isolated from human-curated `20_Knowledge/`.
4. **Agent & Human Friendliness**: Standardize frontmatter per folder, folder naming, file naming, and provide clear decision flowcharts for both humans and AI agents.
5. **Zero Data Loss**: Ensure 100% preservation of note content, attachments, and internal wikilinks during refactoring.
6. **Full YAML Coverage**: Every markdown note must have appropriate frontmatter after migration. Notes without clear classification default to `10_Inbox/`.

---

## 4. Non-Goals

- Refactoring existing third-party Obsidian plugin settings inside `.obsidian/`.
- Converting image assets into markdown or changing media binary content.
- Rewriting historical archive files inside `90_Archive/_old_vault/`.

---

## 5. Design Principles

1. **Determinism over Ambiguity**: If a rule requires subjective guessing, simplify the classification rule.
2. **Flat & Deep Balance**: Keep folder nesting depth $\le 3$ levels wherever possible.
3. **Single Source of Truth**: Content and skills exist canonically in one location only.
4. **Reversibility**: All file moves and renaming must be trackable and reversible.
5. **Human PKM Purity**: Agent-generated content never mixes with human-authored knowledge.
6. **Default to Inbox**: When classification is uncertain, place in `10_Inbox/` — never leave unclassified.

---

## 6. Target Information Architecture

We select **Option C (Revised): Clean Hybrid Architecture** — Numeric Prefixes for Core Top-Level Categories + Semantic Sub-folders + Hidden Agent Runtime.

### Top-Level Category Map

| Folder | Name | Purpose | Author | Lifecycle |
|---|---|---|---|---|
| `.agent/` | Agent Runtime | Skills (general + agent-specific), symlink targets | Agents + Human setup | Permanent |
| `00_System` | System & Config | Templates, configuration, migration tools, system metadata | Humans | Permanent |
| `10_Inbox` | Capture & Triage | Raw incoming notes, web clips, unclassified content | Both | Temporary |
| `20_Knowledge` | Human Knowledge Base | Human-authored concepts, entities, guides, references | Humans | Permanent |
| `30_Pipeline` | Content Production | Social media content lifecycle (Ideas → Published) | Both | Workflow |
| `40_Projects` | Active Projects | Active projects with clear deliverables, PRDs, task lists | Humans | Temporary |
| `50_Memory` | Operational State | Daily logs, agent execution logs, standing directives | Both | Dynamic |
| `60_Assets` | Attachments & Media | Central repository for images, diagrams, audio, PDFs | System | Permanent |
| `70_Wiki` | LLM Knowledge Graph | Agent-maintained wiki, research synthesis, confidence-scored | Agents | Permanent (rebuildable) |
| `90_Archive` | Inactive & Historical | Completed projects, legacy vaults, deprecated documents | Humans | Archive |

---

## 7. Folder Usage Rules

### `.agent/`
- **Purpose**: Agent skill runtime directory. Contains all skills organized by capability, with sub-folders for agent-specific overrides.
- **What belongs there**: Skill files (`SKILL.md`), agent-specific skill overrides, the `yaml_guide.md` frontmatter reference.
- **What does NOT belong there**: Personal knowledge, content drafts, operational logs, Obsidian notes.
- **Who normally creates content there**: Humans (initial setup), Agents (skill proposals requiring human validation).
- **Temporary or permanent**: Permanent.
- **When content moves elsewhere**: Never — skills are consumed in-place via symlinks.
- **Agent write permissions**: Agents may propose new skills but must not modify existing skills without human approval.
- **Distribution model**: Each agent runtime symlinks to the relevant directories:
  ```bash
  # General skills — shared by all agents
  ln -s /path/to/vault/.agent/skills ~/.gemini/antigravity/skills
  # Agent-specific skills
  ln -s /path/to/vault/.agent/skills_antigravity ~/.gemini/antigravity/skills_agent
  ```
- **Structure**:
  ```
  .agent/
  ├── yaml_guide.md              ← Canonical frontmatter schemas for all folders
  ├── skills/                    ← General skills (shared across all agents)
  │   ├── workers/
  │   ├── judges/
  │   ├── planners/
  │   ├── routing/
  │   └── utilities/
  ├── skills_antigravity/        ← Antigravity-specific skills
  ├── skills_pi/                 ← Pi Agent-specific skills
  └── skills_prime/              ← Prime Agent-specific skills
  ```
- **Naming convention**: `snake_case` for all files and directories inside `.agent/`.

### `00_System/`
- **Purpose**: Central configuration, templates, and system metadata.
- **What belongs there**: Note templates, system dashboards, migration manifests.
- **What does NOT belong there**: Agent skills (those go to `.agent/`), personal knowledge, content drafts.
- **Who normally creates content there**: Humans and Agents (configuration updates).
- **Temporary or permanent**: Permanent.
- **When content moves elsewhere**: Rarely, unless deprecated to Archive.
- **Agent write permissions**: Agents may write configuration updates (requires human validation).

### `10_Inbox/`
- **Purpose**: Triage and raw capture of incoming information. **Default location for any unclassified content.**
- **What belongs there**: Raw web clips, unprocessed thoughts, voice transcripts, read-it-later imports, and any note whose classification is uncertain.
- **What does NOT belong there**: Finished knowledge, active project specs.
- **Who normally creates content there**: Both Humans and Agents.
- **Temporary or permanent**: Temporary (Expected lifespan $\le 7$ days).
- **When content moves elsewhere**: After human or agent triage, moved to `20_Knowledge`, `30_Pipeline`, `40_Projects`, or `70_Wiki`.
- **Agent write permissions**: Agents may freely write here as a default capture zone.

### `20_Knowledge/`
- **Purpose**: Canonical, durable, **human-authored** knowledge base.
- **What belongs there**: Human-synthesized concepts, frameworks, entity profiles (tools/people), research, and technical guides written by the user.
- **What does NOT belong there**: Agent-generated research (→ `70_Wiki/`), unprocessed notes (→ `10_Inbox/`), operational logs (→ `50_Memory/`).
- **Who normally creates content there**: **Humans only**. Agents may promote content here only after explicit human review.
- **Temporary or permanent**: Permanent.
- **When content moves elsewhere**: Only if deprecated to `90_Archive`.
- **Agent write permissions**: Agents should NOT write here directly. Agent-generated knowledge goes to `70_Wiki/` first and is promoted here by humans.
- **Subfolders**: `Concepts/`, `Entities/`, `Guides/`, `References/`.

### `30_Pipeline/`
- **Purpose**: Content production lifecycle.
- **What belongs there**: Social media posts, blog drafts, YouTube scripts.
- **What does NOT belong there**: General knowledge.
- **Who normally creates content there**: Humans and Agents (content generators).
- **Temporary or permanent**: Workflow state (transitions through lifecycle).
- **When content moves elsewhere**: Remains in pipeline but shifts folders (e.g., `01_Ideas` → `02_Drafts` → `05_Published`).
- **Agent write permissions**: Agents may freely write and move files within these lifecycle stages.

### `40_Projects/`
- **Purpose**: Time-bound initiatives.
- **What belongs there**: Active project files (PRDs, task lists, specific assets).
- **What does NOT belong there**: General knowledge that spans multiple projects.
- **Who normally creates content there**: Humans.
- **Temporary or permanent**: Temporary (lifespan = project duration).
- **When content moves elsewhere**: Upon completion, the entire folder moves to `90_Archive`.
- **Agent write permissions**: Agents may write to task lists or generate project assets automatically.

### `50_Memory/`
- **Purpose**: Agent and human operational state and chronological logs.
- **What belongs there**: Daily notes, agent execution logs, standing instructions, audience insights.
- **What does NOT belong there**: Reusable technical guides (→ `20_Knowledge/Guides/`), synthesized knowledge (→ `70_Wiki/`).
- **Who normally creates content there**: Primarily Agents (automated logs), and Humans (daily journal).
- **Temporary or permanent**: Permanent (chronological record).
- **When content moves elsewhere**: Never.
- **Agent write permissions**: Agents write here continuously (e.g., daily loop outputs, system metrics).

### `60_Assets/`
- **Purpose**: Binary and media attachments.
- **What belongs there**: Images (PNG/JPG/SVG), Excalidraw files, PDFs.
- **What does NOT belong there**: Markdown text files (unless `.canvas`).
- **Who normally creates content there**: System tools, Obsidian paste, or Agents (image generators).
- **Temporary or permanent**: Permanent.
- **When content moves elsewhere**: If the parent note is archived or deleted.
- **Agent write permissions**: Agents may save generated images here.

### `70_Wiki/`
- **Purpose**: Agent-maintained knowledge graph. A structured, interlinked wiki that the agent builds and maintains from user notes and internet research.
- **What belongs there**: Agent-synthesized concept pages, entity profiles, comparison analyses, research summaries. All content is machine-generated and confidence-scored.
- **What does NOT belong there**: Human-authored personal notes (→ `20_Knowledge/`), journal entries (→ `50_Memory/`), or manually curated knowledge.
- **Who normally creates content there**: **Agents ONLY**. Humans may read and annotate but should not author new pages here.
- **Temporary or permanent**: Permanent but rebuildable. Content can be regenerated from sources if lost.
- **When content moves elsewhere**: When a human reviews and promotes a wiki page to canonical personal knowledge, a refined version moves to `20_Knowledge/` and the wiki page links to it.
- **Agent write permissions**: Agents have **FULL** write access. This is the agent's domain.
- **Schema**: Governed by `70_Wiki/SCHEMA.md`.
- **Subfolders**: `concepts/`, `entities/`, `comparisons/`, `queries/`, `raw/` (articles, papers, transcripts).

### `90_Archive/`
- **Purpose**: Historical retention.
- **What belongs there**: Old vaults, completed projects, deprecated concepts.
- **What does NOT belong there**: Anything actively used.
- **Who normally creates content there**: Humans (via moving folders).
- **Temporary or permanent**: Permanent (cold storage).
- **When content moves elsewhere**: Never.
- **Agent write permissions**: Agents should NOT write or move things here automatically without human approval.

---

## 8. Naming Conventions

| Context | Convention | Example |
|---|---|---|
| Top-level folders | Numeric prefix + `snake_case` | `20_Knowledge`, `70_Wiki` |
| Obsidian note files | `Title Case` with spaces | `Transformer Architecture.md` |
| `.agent/` files and directories | `snake_case` | `research_and_scrape/SKILL.md` |
| Daily logs | ISO date format | `2026-08-28.md` |
| Wiki pages (70_Wiki) | Lowercase with hyphens | `transformer-architecture.md` |

---

## 9. Inbox / Triage Resolution

Explicitly solving the ambiguity between `Inbox` and `10 - Notes`:
- **Capture/Triage** → `10_Inbox` (Temporary, must process).
- **Permanent Human Knowledge** → `20_Knowledge` (Durable, human-authored).
- **Agent-Generated Knowledge** → `70_Wiki` (Agent-maintained, confidence-scored).
- **Project/Work** → `40_Projects` (Time-bound).
- **Reference** → `20_Knowledge/References`.
- **Default Rule**: If unsure where a note belongs → `10_Inbox`. Always.

---

## 10. Knowledge / Wiki / Memory Boundary Resolution

The triple boundary is defined by **authorship** and **purpose**:

| Folder | Author | Purpose | Content Characteristics |
|---|---|---|---|
| `20_Knowledge` | Human | Durable personal reference | Curated, evergreen, high-confidence |
| `70_Wiki` | Agent | Navigable knowledge graph | Synthesized, confidence-scored, interlinked |
| `50_Memory` | Both | Operational state | Chronological, ephemeral, contextual |

**The litmus test**: *Who wrote it, and what is it for?*
- **Human wrote it for durable reference** → `20_Knowledge/`
- **Agent wrote it as synthesized knowledge** → `70_Wiki/`
- **Anyone logged it as operational context** → `50_Memory/`

**Migration rules**:
- Merge `10 - Notes` (atomic notes) → `20_Knowledge/Concepts/` or `20_Knowledge/Guides/`.
- Migrate `50_Wiki/` → `70_Wiki/` (rename, do NOT merge into `20_Knowledge/`).
- Merge `00_System/Memory/Learnings/` → `20_Knowledge/Guides/`.
- Separate daily logs into `50_Memory/Daily_Logs/`.

**Promotion flow**:
```
Internet Research ──→ 70_Wiki/raw/
                         │
                    Agent synthesis
                         │
                         ▼
                    70_Wiki/concepts/
                    70_Wiki/entities/
                         │
                    Human review & promotion
                         │
                         ▼
                    20_Knowledge/Concepts/
                    20_Knowledge/Entities/
```

---

## 11. Standard Obsidian Concerns

- **Attachments**: `60_Assets/`.
- **Daily notes**: `50_Memory/Daily_Logs/`.
- **Templates**: `00_System/Templates/`.
- **System/configuration files**: `.obsidian/` and `00_System/`.
- **Agent skills**: `.agent/skills/`.
- **Archives**: `90_Archive/`.
- **Projects**: `40_Projects/`.
- **References/resources**: `20_Knowledge/References/`.
- **Agent knowledge graph**: `70_Wiki/`.
- **Agent operational logs**: `50_Memory/`.
- **When to use folders vs metadata vs links**: Use folders for the top-level categories and core lifecycle stages. Use metadata (frontmatter) for detailed taxonomy (status, type, tags). Use links for associative relations.

---

## 12. Empty Folder Policy

- **Architectural Empty Folders**: Do NOT delete empty folders that serve a structural lifecycle role, such as `30_Pipeline/04_Scheduled`, `05_Published`, or `20_Knowledge/Competitor_Analysis`. They provide the necessary scaffold for future inputs.
- **Abandoned Folders**: Empty folders without structural purpose (e.g., `40_Projects/AAA`, `.agents/`) will be removed.

---

## 13. Agent Skills Architecture

### Location & Organization
- **Where skills live**: Canonically in `.agent/skills/` (general) and `.agent/skills_<agent>/` (agent-specific).
- **Organization**: Organized by **capability** (e.g., `workers`, `judges`, `planners`, `routing`, `utilities`).
- **Structure**: Each skill gets its own folder (e.g., `.agent/skills/workers/research_and_scrape/SKILL.md`).

### Distribution Model
- **No sync scripts**: Skills are distributed via OS-level symlinks from agent runtime directories to `.agent/`.
- **Instant propagation**: Because symlinks are live filesystem references, any edit to a skill in `.agent/` is immediately available to all linked agents.
- **Agent-specific overrides**: If an agent needs a customized version of a shared skill, place it in `.agent/skills_<agent>/` — the agent's runtime resolves its own directory first.

### Metadata
- Handled via YAML frontmatter in `SKILL.md`:
  ```yaml
  ---
  name: Research and Scrape
  version: 1.0.0
  capabilities: [web_research, summarization]
  inputs: [topic, depth]
  outputs: [summary_md]
  ---
  ```
- Versioning tracked via `version:` field, incremented on change.

### Migration from `00_System/Skills/`
- All skill files (Workers, Judges, Planners, Routing, Utilities) move to `.agent/skills/`.
- Voice_DNA files move to `.agent/skills/voice_dna/` (treated as a skill the agent loads for tone).
- `sync_skills.py` is deprecated and removed.
- `00_System/Skills/` is deleted after migration.

---

## 14. Canonical Frontmatter Schemas

Each folder has specific frontmatter requirements. The full schema reference is maintained in `.agent/yaml_guide.md` for agent consumption (single-file load, minimal tokens).

### Summary of Per-Folder Schemas

**`20_Knowledge/`** — Human knowledge:
```yaml
---
title: Note Title
type: concept | entity | guide | reference
status: seed | incubation | evergreen
tags: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

**`70_Wiki/`** — Agent wiki (richest schema):
```yaml
---
title: Page Title
type: entity | concept | comparison | query
tags: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: [raw/articles/source-file.md]
confidence: high | medium | low
contested: false
contradictions: []
---
```

**`50_Memory/`** — Operational logs:
```yaml
---
type: daily_log | agent_log | directive | insight
date: YYYY-MM-DD
agent: antigravity | pi | prime | human
---
```

**`30_Pipeline/`** — Content production:
```yaml
---
title: Post Title
type: idea | draft | review | scheduled | published
platform: twitter | linkedin | blog | youtube
pillar: []
status: active | completed
created: YYYY-MM-DD
---
```

**`40_Projects/`** — Projects:
```yaml
---
type: project | prd | task_list | decision_log
status: active | completed | paused
created: YYYY-MM-DD
---
```

**`10_Inbox/`** — Minimal (triage):
```yaml
---
source: manual | web_clip | agent_capture
captured: YYYY-MM-DD
---
```

---

## 15. Decision Tree for Humans & AI Agents

When encountering any piece of content $C$:
```
1. Is $C$ a system template or configuration?
   ├── YES ──> Place in 00_System/
   └── NO  ──> Proceed to Step 2

2. Is $C$ an agent skill definition?
   ├── YES ──> Place in .agent/skills/ (or .agent/skills_<agent>/)
   └── NO  ──> Proceed to Step 3

3. Is $C$ an unprocessed quick capture or web clipping?
   ├── YES ──> Place in 10_Inbox/
   └── NO  ──> Proceed to Step 4

4. Is $C$ an active content piece (post, blog, video)?
   ├── YES ──> Place in 30_Pipeline/ (01_Ideas, 02_Drafts, etc.)
   └── NO  ──> Proceed to Step 5

5. Is $C$ part of a time-bound project with deliverables?
   ├── YES ──> Place in 40_Projects/<Project_Name>/
   └── NO  ──> Proceed to Step 6

6. Is $C$ an agent execution log, daily log, or directive?
   ├── YES ──> Place in 50_Memory/
   └── NO  ──> Proceed to Step 7

7. Is $C$ an attachment/image/drawing?
   ├── YES ──> Place in 60_Assets/
   └── NO  ──> Proceed to Step 8

8. Was $C$ authored by an agent (research, synthesis, wiki page)?
   ├── YES ──> Place in 70_Wiki/
   └── NO  ──> Proceed to Step 9

9. Is $C$ human-authored durable knowledge?
   ├── YES ──> Place in 20_Knowledge/ (Concepts, Entities, Guides, or References)
   └── NO  ──> Place in 10_Inbox/ (DEFAULT — classify later)
```

---

## 16. Root-Level File Resolution

| File | Destination |
|---|---|
| `AGENT.md` | Stays at vault root (agent convention) |
| `README.md` | Stays at vault root (git convention) |
| `Kitty Terminal.md` | `20_Knowledge/Guides/` |
| `Obsidian Refactor Prompt.md` | `40_Projects/Vault_Refactor_And_Skills_Repo/` |
| `_wikilink_analysis.py` | `00_System/Scripts/` (then delete after migration) |
| `cleanup.py` | `00_System/Scripts/` (then delete after migration) |
| `fix_frontmatter.py` | `00_System/Scripts/` (then delete after migration) |
| `fix_links.py` | `00_System/Scripts/` (then delete after migration) |
| `move_files.py` | `00_System/Scripts/` (then delete after migration) |
| `test.txt` | Delete |

---

## 17. Safety & Reversibility Strategy

1. **Backup**: Create a full backup archive of `<REDACTED>` before any move operation.
2. **Git Tracking**: Ensure git state is initialized; commit baseline before migration begins.
3. **Link Rewriting**: Use Python script to parse and update all `wikilinks` if paths break.
4. **Migration Manifest**: Log all file movements to `00_System/Migration_Manifest.json`.

---

## 18. Acceptance Criteria

1. Vault top-level directory contains exactly the standardized folders (`00_System`, `10_Inbox`, `20_Knowledge`, `30_Pipeline`, `40_Projects`, `50_Memory`, `60_Assets`, `70_Wiki`, `90_Archive`) + hidden directories (`.agent/`, `.obsidian/`).
2. Zero orphaned files or empty folders remain without architectural purpose.
3. 100% of notes are categorized deterministically according to the decision flow.
4. **100% of markdown notes have appropriate YAML frontmatter** per the schemas defined in §14.
5. `.agent/skills/` contains all skills migrated from `00_System/Skills/` with standardized `SKILL.md` frontmatter.
6. `.agent/yaml_guide.md` exists with complete per-folder frontmatter schemas.
7. `70_Wiki/` exists with `SCHEMA.md` and `index.md`, containing all content migrated from `50_Wiki/`.
8. `70_Wiki/` content is fully isolated from `20_Knowledge/` — no agent-generated content in human knowledge.
9. All existing internal wikilinks remain functional.
10. All case-duplicate subdirectories are resolved (e.g., `Concepts/` vs `concepts/`).
11. No loose files remain at vault root except `AGENT.md` and `README.md`.
12. `00_System/Skills/` is removed after migration to `.agent/`.

---

## 19. Open Decisions Requiring User Approval

> [!IMPORTANT]
> The following decisions require explicit user confirmation before proceeding to execution:

1. **Folder Scheme**: Confirm the revised 9+1 taxonomy (`.agent/`, `00_System`, `10_Inbox`, `20_Knowledge`, `30_Pipeline`, `40_Projects`, `50_Memory`, `60_Assets`, `70_Wiki`, `90_Archive`). **✅ APPROVED**
2. **Notes & Wiki Separation**: Confirm `10 - Notes` merges into `20_Knowledge/`, while `50_Wiki/` becomes `70_Wiki/` (NOT merged into `20_Knowledge/`). **✅ APPROVED**
3. **Agent Skills to `.agent/`**: Confirm replacing `00_System/Skills/` and `sync_skills.py` with `.agent/skills/` + symlink distribution model. **✅ APPROVED**
4. **LLM Wiki**: Confirm `70_Wiki/` as the agent-maintained knowledge graph, isolated from human PKM. **✅ APPROVED**
5. **Frontmatter Standardization**: Confirm per-folder YAML schemas with `.agent/yaml_guide.md` as the canonical reference. **✅ APPROVED**
6. **Default to Inbox**: Confirm all unclassified notes default to `10_Inbox/` during migration. **✅ APPROVED**
7. **Naming Conventions**: Confirm `Title Case` for Obsidian notes, `snake_case` for `.agent/` files. **✅ APPROVED**
8. **Non-Destructive Safe Migration**: Confirm full backup + git baseline + Migration Manifest. **✅ APPROVED**
