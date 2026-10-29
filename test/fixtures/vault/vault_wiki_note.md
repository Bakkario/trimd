---
title: Environment Swamps (Known-Broken Patterns on linbox)
type: concept
tags: [devops, local-inference, agent]
created: 2026-10-18
updated: 2026-10-24
sources: ["40_Projects/Agent_Environment_Ops/01_Knowledge_Brain_Dump.md", "50_Memory/Daily_Logs/24-Oct-2026.md"]
confidence: high
contested: false
contradictions: []
review_after: 2027-01-18
---

# Environment Swamps (Known-Broken Patterns on linbox)

## Definition

A *swamp* is a verified, reproducible environment failure documented as **symptom → cause → verdict**, so a future session pattern-matches it in seconds instead of re-diagnosing it for an hour. The narrative register lives in the project brain dump (Agent_Environment_Ops §5); this page is the distilled durable version for the wiki.^[Source: 40_Projects/Agent_Environment_Ops/01_Knowledge_Brain_Dump.md, section "5. THE SWAMPS".]

## Mechanism / The Register

1. **Snap Firefox 158 headless is broken — do not attempt, ever.** Symptoms: `--headless --screenshot` hangs (exit 124, no file); any explicit `--profile <dir>` → `Could not find profile folder` (even pre-created empty dirs); while user Firefox runs → `already running but not responding`; `:9222/json` and `/json/list` return 404 (REST routes removed in 158); snap geckodriver hits the same profile failure; `omni.ja` cannot be parsed by unzip or python zipfile. Cost of discovery: ~1 h (2026-10-17). Verdict: use Playwright/Chromium.^[Local observation: 40_Projects/Agent_Environment_Ops/01_Knowledge_Brain_Dump.md, §5.1, all symptoms reproduced on Kubuntu 26.04.]
2. **`apt install chromium-browser` is a snap stub** on Kubuntu 26.04 — it pulls the broken snap build. Never install it; Playwright ships its own Chromium.^[Local observation: 40_Projects/Agent_Environment_Ops/01_Knowledge_Brain_Dump.md, §5.2.]
3. **Chrome headless CLI (only if bypassing Playwright):** WebGL requires `--enable-unsafe-swiftshader` (software fallback deprecated; without it: `Error creating WebGL context`); `--virtual-time-budget` costs ~5.5× real time under SwiftShader (22 s virtual ≈ 120 s+ real) — keep budgets ≤ 15000 ms.^[Local observation: 40_Projects/Agent_Environment_Ops/01_Knowledge_Brain_Dump.md, §5.3, timing measured on Ryzen 5600X.]
4. **`pkill -f <pattern>` footgun:** the pattern appears in the agent's *own shell* command line, so pkill SIGTERMs the agent's command (exit 143). Bit twice in one session. Use `ps aux | awk '/pattern/ && !/awk/' {print $2}` and kill explicit PIDs.^[Local observation: 40_Projects/Agent_Environment_Ops/01_Knowledge_Brain_Dump.md, §5.4.]
5. **GGUF tools on a full-VRAM box (qmd case):** auto-GPU mode probes CUDA, tries to fit the embedding context into the ~800 MB the 27B leaves free → `Failed to create any embedding context` with **no CPU fallback for allocation failure** (init failure does fall back; allocation failure does not). Fix: `QMD_FORCE_CPU=1`. Footgun: `QMD_LLAMA_GPU=cpu` is an *invalid* value (only `metal|vulkan|cuda|false/off/none/disable/disabled/0`) → warning + auto → back into the trap. Red herring: pnpm's `Ignored build scripts: node-llama-cpp` is not fatal — the 28 MB native libs ship inside the `@node-llama-cpp/linux-x64` platform package.^[Local observation: 40_Projects/Agent_Environment_Ops/01_Knowledge_Brain_Dump.md, §5.5, verified against qmd 2.8.3 source 2026-10-18.]
6. **Shell realities:** `/tmp` is wiped on reboot (durable tools live in `~/.tools/` or `~/.cache/`); the agent's non-interactive shell does not source `~/.bashrc` (no user aliases/PATH — absolute paths only); `sudo` needs a password (the user runs sudo one-liners; keep them copy-paste-ready).^[Local observation: 40_Projects/Agent_Environment_Ops/01_Knowledge_Brain_Dump.md, §5.6.]
7. **sshd behind systemd socket activation: `systemctl restart ssh` silently ignores `ListenAddress` changes.** On Kubuntu 26.04, `ssh.socket` (not sshd) owns the listening sockets; `sshd-socket-generator` derives the socket's `ListenStream` from sshd_config but re-runs only at boot or `systemctl daemon-reload` (output: `/run/systemd/generator/ssh.socket.d/addresses.conf`). Symptom: after adding a `ListenAddress` + `systemctl restart ssh`, `ss -tln` shows only the old bind, the journal shows a clean `Server listening on <old-ip> port 22` (no error anywhere), and `ss -tlnpe` labels the socket's cgroup `ssh.socket`. Companion gotcha in the same fix: UFW rules are interface-scoped — `22/tcp on tailscale0` does not cover LAN traffic, so LAN access also needs `sudo ufw allow from <REDACTED> to any port 22 proto tcp`. Fix: `sudo systemctl daemon-reload && sudo systemctl restart ssh.socket ssh`. Cost of discovery: ~20 min (2026-10-24, wiring pop-os ↔ linbox SSH). Verdict: daemon-reload + restart the socket for any sshd listen-config change.^[Local observation: pi session 2026-10-24 — silent no-op reproduced; verified via `ss -tlnpe` (cgroup label), `systemctl cat ssh.socket` (generated drop-in), `journalctl -u ssh` (single listen line).]

## Practical Implications

- Run symptom pattern-matching against this page **before** any new diagnosis (procedure: [[how-to-diagnose-env-problems]]).
- The working alternative for swamps 1–3 is the [[headless-browser-verification]] convention.
- All entries are version-scoped (Firefox 158, Chrome SwiftShader, Kubuntu 26.04, qmd 2.8.3, systemd `sshd-socket-generator`): re-verify only when those versions change; do not present them as universal behavior.^[Source: 40_Projects/Agent_Environment_Ops/01_Knowledge_Brain_Dump.md, §5.]

## Relationships

- [[local-llm-infrastructure]] — the full-VRAM constraint behind swamp 5.
- [[llama-cpp]] — node-llama-cpp platform-package detail.
- [[linbox]] — the machine all entries apply to.
- [[headless-browser-verification]] — the convention that routes around swamps 1–3.

## Open Questions

- Will a future snap-Firefox major version fix headless? Re-test on major upgrades only.
- Which other tools share the swamp-5 class (auto-GPU with no CPU fallback on allocation failure)?
