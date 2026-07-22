// Theme B / B10 - An AI agent driving a supply-chain change itself.
// The agent is not just consuming packages, it is INSTALLING them: `claude` -> zsh -> pip/npm
// install. Every such event should show up in KOI's Audit stream as an `installed` action
// shortly afterwards; if it does not, KOI has not rescanned yet (see B9).
// Detection + Investigation.
dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter
    cmd  = lowercase(coalesce(action_process_image_command_line, "")),
    proc = lowercase(coalesce(action_process_image_name, "")),
    root = lowercase(coalesce(causality_actor_process_image_name, ""))
// Only inside an agent's causality group - a developer typing `pip install` themselves is
// not agentic risk and must not fire this.
| filter root contains "claude" or root contains "cursor" or root contains "antigravity"
      or root contains "windsurf" or root contains "codex" or root = "code" or root = "code.exe"
| filter (cmd contains "pip install" or cmd contains "pip3 install" or cmd contains "npm install"
       or cmd contains "npm i " or cmd contains "yarn add" or cmd contains "pnpm add"
       or cmd contains "uv pip install" or cmd contains "uv add" or cmd contains "uvx "
       or cmd contains "npx " or cmd contains "brew install" or cmd contains "cargo install"
       or cmd contains "go install" or cmd contains "gem install"
       or cmd contains "docker pull" or cmd contains "curl -" and cmd contains "| sh")
| alter ecosystem = if(
      cmd contains "pip",    "pypi",
      cmd contains "npm" or cmd contains "npx" or cmd contains "yarn" or cmd contains "pnpm", "npm",
      cmd contains "uv",     "pypi_uv",
      cmd contains "brew",   "homebrew",
      cmd contains "cargo",  "crates",
      cmd contains "go ",    "go",
      cmd contains "gem",    "rubygems",
      cmd contains "docker", "docker",
                             "shell_pipe")
| comp count() as installs,
       min(_time) as first_seen,
       max(_time) as last_seen
   by agent_hostname, causality_actor_process_image_name, action_process_username,
      ecosystem, action_process_image_name, action_process_image_command_line
| sort desc installs
