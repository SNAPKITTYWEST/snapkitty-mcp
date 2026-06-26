# @snapkitty/mcp-server

Sovereign-grade MCP server for SnapKitty Collective.

Exposes SnapKitty's core capabilities as MCP tools — callable from Claude, any MCP client, or directly via npx.

## Tools

| Tool | What it does |
|------|-------------|
| `worm_seal` | Seal any payload into the SHA-256 WORM chain |
| `worm_read` | Read and verify the WORM chain |
| `agent_build` | Create a sovereign agent manifest (SENTINEL/ORACLE/BUILDER/ARCHIVIST/BERSERKER) |
| `ada_contract_generate` | Generate an Ada-syntax governance contract, WORM-sealed |
| `twin_chat` | Chat with a local Ollama model, response WORM-sealed |
| `sovereign_inject` | Generate a Mamba SSM injection spec from Lean 4 theorem + Ada contract |

## Install

```bash
npm install -g @snapkitty/mcp-server
```

## Claude Desktop config

```json
{
  "mcpServers": {
    "snapkitty": {
      "command": "snapkitty-mcp"
    }
  }
}
```

## Claude Code config (.mcp.json)

```json
{
  "mcpServers": {
    "snapkitty": {
      "command": "npx",
      "args": ["@snapkitty/mcp-server"]
    }
  }
}
```

## Requirements

- Node.js 20+
- Ollama running locally (for `twin_chat` — optional, other tools work offline)

## Architecture

The `sovereign_inject` tool implements the BOB/METATRON architecture:

```
Lean 4 theorem  ──┐
                   ├──→  injection_vector (2048-dim)  ──→  SSM state gate
Ada contract    ──┘                                         h(t) = ā·h(t-1) + b̄·x(t) + W·v_inject
```

Structured symbolic proofs are embedded into SSM hidden state directly — bypassing the context window.
The proof gate fires *before* state advances. Invalid proofs block state transitions.

## Sovereign Stack

Built by SnapKitty Collective | [collectivekitty.com](https://collectivekitty.com)

![](https://sovereign-analytics.snapkittywest.workers.dev/canary/snapkitty-mcp)
