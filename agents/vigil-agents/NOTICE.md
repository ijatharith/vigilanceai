# Attribution

This directory contains **VIGIL Agents**, written by **Majdi Ahmadi**, used in
the Vigilance FYP with the author's permission.

- Source: https://github.com/majdiahmadi/vigil-agents
- Imported commit: `3024cb99c614679ee18448fcd6d92a39cf5623ce` ("second commit", 2026-10-20)
- Imported on: 2026-11-09, without its Git history
- License: MIT, as declared in `pyproject.toml` (the upstream repository has no LICENSE file)

## Integration boundary

The agents run as a **separate service** with their own virtual environment
(`.venv` here) and API. The Vigilance backend talks to it only over HTTP
(`backend/app/integrations/vigil_agents.py`) and does not import this code.

## Local changes

- 2026-11-09 `vigil/llm/adapter.py`: NVIDIA requests now stream (SSE) to avoid read
  timeouts on large reasoning models, and send Nemotron settings
  (`enable_thinking`, `temperature=1`, `top_p=0.95`, `max_tokens=16384`). These can be
  overridden with `VIGIL_NVIDIA_*`. `reasoning_content` is discarded and never stored.
  Timeouts: `VIGIL_LLM_IDLE_TIMEOUT` (default 120 s), `VIGIL_LLM_TOTAL_TIMEOUT` (default 600 s).
  Tests: `tests/unit/test_nvidia_streaming.py`.

When re-importing upstream, re-apply or drop these changes and record it above.
