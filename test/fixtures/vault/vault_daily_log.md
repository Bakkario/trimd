---
type: daily_log
date: 2026-10-29
agent: pi
---
# Daily Log — 29-Oct-2026

## 04:45 — Prime Agent configured for local Qwen3.8-27B with thinking levels
**Action:**
- Wrote `~/.prime/agent/models.json`: provider `qwen-local` (OpenAI-completions → `http://<REDACTED>:8080/v1`, llama.cpp server from `~/llama-pi.sh`), `compat.thinkingFormat: qwen-chat-template` (same as pi's `~/.pi/agent/models.json`).
- Two model entries in the Prime Agent `/model` list: `qwen3.8-27b` (thinking ON, level selectable via `/thinking`) and `qwen3.8-27b-fast` (thinking OFF, no reasoning). Server accepts any model alias — alias entries safe.
- Verified: `prime-agent model list` shows both entries; end-to-end print-mode turn returned "ready"; curl confirms `chat_template_kwargs.enable_thinking=false` suppresses `reasoning_content` (2-token "OK" reply) while thinking-on produces reasoning tokens.
- Note: Qwen3.8 thinking is binary — any `/thinking` level other than `off` sends `enable_thinking:true`, so low/medium/high behave identically. Same model/behavior as pi's `qwen-local` provider.
- Usage: in Prime Agent → `/model` pick an entry (Ctrl+S saves default), `/thinking` pick level (Ctrl+S saves). CLI: `prime-agent --provider qwen-local --model qwen3.8-27b --thinking high`.
