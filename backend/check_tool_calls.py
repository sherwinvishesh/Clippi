#!/usr/bin/env python3
"""
check_tool_calls.py — Audit MCP tool calls.

Fetches _dispatch_tool_call traces from W&B Weave, prints them
to the terminal, then asks Mistral to compare the called tool names
against the names actually defined in chat.py.

Usage:
    python check_tool_calls.py           # last 200 calls
    python check_tool_calls.py --limit 50
"""
import os, sys, json, argparse
from collections import Counter
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

# ── Tool names as defined in chat.py ─────────────────────────────────────────
# Keep this list in sync with VISUAL_TOOLS + AUDIO_TOOLS in app/routers/chat.py
DEFINED_TOOLS: list[str] = [
    # Visual / geometry
    "trim_clip", "crop_clip", "rotate_clip", "flip_clip", "set_speed",
    "reset_clip_edits",
    # Color & filters
    "update_color", "reset_color", "apply_filter", "reset_filter",
    # Text
    "add_text_overlay",
    # Navigation
    "navigate_to_editor", "select_clip",
    # Visual AI
    "visual_edit_object",
    # Audio (ElevenLabs)
    "audio_add_sound_effect", "audio_dub_video", "audio_add_background_music",
    "audio_denoise", "audio_add_captions", "audio_add_voiceover",
]

SEP  = "─" * 62
DSEP = "═" * 62


# ── 1. Fetch from W&B Weave ───────────────────────────────────────────────────

def fetch_tool_calls(limit: int) -> tuple[list[dict], str | None]:
    """Return (records, error_message). Records have fn_name, fn_args, success, ts."""
    wb_key = os.getenv("WANDB_API_KEY", "")
    if not wb_key:
        return [], "WANDB_API_KEY not set in .env"

    try:
        import wandb
        wandb.login(key=wb_key, anonymous="never", relogin=False)
    except Exception as e:
        return [], f"wandb login failed: {e}"

    try:
        import weave
        from weave.trace.weave_client import CallsFilter

        client = weave.init("clippi")

        # Try op_names filter first (requires full ref — we wildcard the digest).
        # Weave stores refs as  weave:///entity/project/op/name:digest
        # We match by checking the op_name string client-side as a fallback.
        raw_calls = list(
            client.get_calls(limit=limit, sort_by=[{"field": "started_at", "direction": "desc"}])
        )
    except Exception as e:
        return [], f"weave.get_calls failed: {e}"

    records = []
    for call in raw_calls:
        op = str(getattr(call, "op_name", "") or "")
        if "_dispatch_tool_call" not in op:
            continue
        inp     = call.inputs or {}
        out     = call.output  or {}
        fn_name = inp.get("fn_name")
        if not fn_name:
            continue
        records.append({
            "fn_name":    fn_name,
            "fn_args":    inp.get("fn_args", {}),
            "success":    out.get("success"),
            "started_at": str(getattr(call, "started_at", "") or ""),
            "exception":  getattr(call, "exception", None),
        })

    return records, None


# ── 2. Mistral analysis ───────────────────────────────────────────────────────

def mistral_validate(records: list[dict]) -> str:
    api_key = os.getenv("MISTRAL_API_KEY", "")
    if not api_key:
        return "(skipped — MISTRAL_API_KEY not set)"

    from mistralai import Mistral
    client = Mistral(api_key=api_key)

    counts   = Counter(r["fn_name"] for r in records)
    failures = Counter(r["fn_name"] for r in records if r["success"] is False)

    prompt = f"""You are a tool-call auditor for an AI video editor assistant called Clippi.

DEFINED tool names in chat.py:
{json.dumps(DEFINED_TOOLS, indent=2)}

CALLED tool names from W&B Weave traces (name → call count):
{json.dumps(dict(counts.most_common()), indent=2)}

FAILED tool names (name → failure count):
{json.dumps(dict(failures.most_common()), indent=2)}

Answer concisely with ✓/✗ symbols:
1. For each CALLED name: does it exactly match a defined tool? List mismatches.
2. Are there any called tool names NOT in the defined list? (regressions / typos)
3. Which defined tools were NEVER called? (unused / dead tools)
4. One-line verdict on whether MCP tool names match the defined names."""

    resp = client.chat.complete(
        model="mistral-small-latest",
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content or "(empty response)"


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Audit Clippi MCP tool calls via W&B Weave + Mistral")
    parser.add_argument("--limit", type=int, default=200, help="Max recent calls to scan (default 200)")
    args = parser.parse_args()

    print(f"\n{DSEP}")
    print("  CLIPPI — MCP TOOL CALL AUDIT")
    print(DSEP)

    # ── Section 1: defined tools ─────────────────────────────────────────────
    print(f"\n{SEP}")
    print(f"  [1] DEFINED TOOLS in chat.py  ({len(DEFINED_TOOLS)} total)")
    print(SEP)
    for t in DEFINED_TOOLS:
        print(f"      • {t}")

    # ── Section 2: fetch Weave logs ──────────────────────────────────────────
    print(f"\n{SEP}")
    print(f"  [2] W&B WEAVE TOOL CALL LOGS  (scanning last {args.limit} calls)")
    print(SEP)

    records, err = fetch_tool_calls(args.limit)

    if err:
        print(f"  ✗  {err}")
        sys.exit(1)

    if not records:
        print("  No _dispatch_tool_call traces found.")
        print("  → Run the chatbot, trigger some tool calls, then re-run this script.")
        sys.exit(0)

    counts   = Counter(r["fn_name"] for r in records)
    failures = Counter(r["fn_name"] for r in records if r["success"] is False)

    print(f"  Found {len(records)} trace(s)  ({len(counts)} unique tool name(s)):\n")
    print(f"  {'STATUS':<8}  {'TOOL NAME':<42}  {'CALLS':>5}  {'FAILS':>5}")
    print(f"  {'------':<8}  {'-'*42}  {'-----':>5}  {'-----':>5}")
    for name, count in counts.most_common():
        match  = "✓" if name in DEFINED_TOOLS else "✗ UNKNOWN"
        nfails = failures.get(name, 0)
        print(f"  {match:<8}  {name:<42}  {count:>5}  {nfails:>5}")

    # ── Section 3: recent call timeline ─────────────────────────────────────
    print(f"\n{SEP}")
    print(f"  [3] RECENT CALL TIMELINE  (last {min(20, len(records))})")
    print(SEP)
    for r in records[:20]:
        ok  = "✓" if r["success"] else ("✗" if r["success"] is False else "?")
        ts  = r["started_at"][:19] if r["started_at"] else "unknown time"
        exc = f"  ← {r['exception'][:60]}" if r.get("exception") else ""
        print(f"  {ok}  {ts}  {r['fn_name']}{exc}")

    # ── Section 4: Mistral analysis ──────────────────────────────────────────
    print(f"\n{SEP}")
    print("  [4] MISTRAL ANALYSIS")
    print(SEP)
    analysis = mistral_validate(records)
    # Indent Mistral's output
    for line in analysis.splitlines():
        print(f"  {line}")

    print(f"\n{DSEP}\n")


if __name__ == "__main__":
    main()
