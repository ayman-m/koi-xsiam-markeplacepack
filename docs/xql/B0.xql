// Theme B / B0 - Ground truth probe: which agent-ish PROCESS IMAGE NAMES actually exist here.
// Run this before anything else. Every other Theme B query is tuned to what this returns;
// guessing at agent binary names produces a library of queries that are all quiet.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter pname = lowercase(action_process_image_name)
| filter pname in ("node","node.exe","npx","npx.cmd","bun","deno","uv","uvx","uvx.exe","python","python.exe","python3","Python","claude","cursor","code","code.exe","ollama","copilot","codex","windsurf","antigravity")
   or pname contains "claude" or pname contains "cursor" or pname contains "copilot"
   or pname contains "ollama" or pname contains "codex" or pname contains "windsurf"
   or pname contains "antigravity" or pname contains "node" or pname contains "npx"
   or pname contains "uvx" or pname contains "aider" or pname contains "gemini"
| comp count() as n by agent_hostname, action_process_image_name
| sort desc n
