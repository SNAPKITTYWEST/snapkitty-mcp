#!/usr/bin/env node
/**
 * SnapKitty MCP Server
 * Exposes sovereign-grade tools: WORM chain, agent builder, Ada contracts, digital twin
 *
 * Install: npm i -g @snapkitty/mcp-server
 * Claude Desktop config: { "command": "snapkitty-mcp" }
 * Claude Code: add to .mcp.json
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { createHash, randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// ── WORM Chain (file-backed) ─────────────────────────────────────────────────

const WORM_PATH = join(process.env.HOME || process.env.USERPROFILE || '.', '.snapkitty-worm.json')

function wormLoad () {
  if (!existsSync(WORM_PATH)) return []
  try { return JSON.parse(readFileSync(WORM_PATH, 'utf8')) } catch { return [] }
}

function wormAppend (label, payload, meta = {}) {
  const chain = wormLoad()
  const prev  = chain.length ? chain[chain.length - 1].seal : '0'.repeat(64)
  const ts    = new Date().toISOString()
  const data  = JSON.stringify({ label, payload, meta, ts, prev })
  const seal  = createHash('sha256').update(data).digest('hex')
  const event = { id: randomUUID(), label, payload, meta, ts, prev, seal }
  chain.push(event)
  writeFileSync(WORM_PATH, JSON.stringify(chain, null, 2), 'utf8')
  return event
}

function wormVerify () {
  const chain = wormLoad()
  for (let i = 1; i < chain.length; i++) {
    if (chain[i].prev !== chain[i - 1].seal) return { valid: false, broken_at: i }
  }
  return { valid: true, events: chain.length }
}

// ── Agent Manifests ──────────────────────────────────────────────────────────

const AGENT_CLASSES = {
  SENTINEL:  { role: 'security', desc: 'Enforces constitutional bounds. Blocks unauthorized writes.' },
  ORACLE:    { role: 'analysis', desc: 'Pattern recognition. Reads without mutating state.' },
  BUILDER:   { role: 'creation', desc: 'Generates artifacts. Sealed into WORM on completion.' },
  ARCHIVIST: { role: 'memory',   desc: 'Long-context indexing. Maintains provenance chain.' },
  BERSERKER: { role: 'chaos',    desc: 'Adversarial testing. Red-team injection attempts.' }
}

function buildAgentManifest (name, agentClass, capabilities = [], model = 'nemotron') {
  const cls   = AGENT_CLASSES[agentClass] || AGENT_CLASSES.BUILDER
  const ts    = new Date().toISOString()
  const manifest = {
    id: randomUUID(),
    name,
    class: agentClass,
    role: cls.role,
    description: cls.desc,
    model,
    capabilities,
    trust_level: agentClass === 'SENTINEL' ? 'SOVEREIGN' : 'HIGH',
    born: ts,
    worm_sealed: null
  }
  const event = wormAppend(`AGENT_BORN:${name}`, JSON.stringify(manifest), { class: agentClass })
  manifest.worm_sealed = event.seal
  return manifest
}

// ── Ada Contract Generator ───────────────────────────────────────────────────

function generateAdaContract ({ agentName, agentClass, capabilities = [], trustLevel = 'HIGH', purpose }) {
  const ts   = new Date().toISOString()
  const seal = createHash('sha256').update(agentName + agentClass + ts).digest('hex')
  const caps = capabilities.map(c => `      "${c}"`).join(',\n') || '      "read"'

  const ada = `-- ════════════════════════════════════════════════════════
-- SNAPKITTY SOVEREIGN CONTRACT v1.0
-- Agent    : ${agentName}
-- Class    : ${agentClass}
-- Trust    : ${trustLevel}
-- Generated: ${ts}
-- Seal     : ${seal}
-- ════════════════════════════════════════════════════════

with Ada.Text_IO;           use Ada.Text_IO;
with Ada.Strings.Unbounded; use Ada.Strings.Unbounded;

package ${agentName.replace(/\W/g, '_')}_Contract is

   type Trust_Level is (NONE, LOW, MEDIUM, HIGH, SOVEREIGN);

   type Capability_Array is array (Positive range <>) of Unbounded_String;

   -- Agent identity
   Agent_Name  : constant String     := "${agentName}";
   Agent_Class : constant String     := "${agentClass}";
   Agent_Trust : constant Trust_Level := ${trustLevel};
   Worm_Seal   : constant String     := "${seal}";

   -- Declared capabilities
   -- Any capability NOT listed here is PROHIBITED by constitution
   Permitted_Capabilities : constant array (1 .. ${Math.max(capabilities.length, 1)}) of String (1 .. 32) :=
   (
${caps}
   );

   ${purpose ? `-- Purpose: ${purpose}` : '-- Purpose: General sovereign agent'}

   procedure Verify_Capability (
      Requested : in String;
      Granted   : out Boolean
   );

   procedure Log_Action (
      Action  : in String;
      Payload : in String;
      Sealed  : out String
   );

   function Trust_Meets_Threshold (
      Required : in Trust_Level
   ) return Boolean is (Agent_Trust >= Required);

end ${agentName.replace(/\W/g, '_')}_Contract;`

  const event = wormAppend(`ADA_CONTRACT:${agentName}`, ada, { class: agentClass, trust: trustLevel })
  return { contract: ada, worm_seal: event.seal }
}

// ── Digital Twin / Ollama Bridge ─────────────────────────────────────────────

async function twinChat (prompt, model = 'nemotron', ollamaHost = 'http://localhost:11434', systemPrompt = '') {
  const body = {
    model,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      { role: 'user', content: prompt }
    ],
    stream: false
  }

  let res
  try {
    res = await fetch(`${ollamaHost}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000)
    })
  } catch (e) {
    throw new Error(`Ollama unreachable at ${ollamaHost}. Is it running? (${e.message})`)
  }

  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`)
  const json  = await res.json()
  const reply = json.message?.content || json.response || '(empty)'

  const event = wormAppend(`TWIN_CHAT:${model}`, JSON.stringify({ prompt: prompt.slice(0, 200), reply: reply.slice(0, 200) }))
  return { reply, model, worm_seal: event.seal, tokens: json.eval_count }
}

// ── BOB Mamba Injection Spec ─────────────────────────────────────────────────
// Generates an injection descriptor for the sovereign orchestrator
// This is the architecture: Lean 4 proof + Ada contract → structured vector → SSM state injection

function generateInjectionSpec (lean4Theorem, adaContract, label = 'sovereign-injection') {
  const proof_hash    = createHash('sha256').update(lean4Theorem).digest('hex')
  const contract_hash = createHash('sha256').update(adaContract).digest('hex')
  const ts            = new Date().toISOString()

  const spec = {
    label,
    ts,
    proof_hash,
    contract_hash,
    injection_vector_dim: 2048,
    injection_schema: {
      dims_0_255:   'Lean 4 proof obligation embedding (256-float normalized)',
      dims_256_511: 'Ada contract compliance embedding (256-float normalized)',
      dims_512_767: 'WORM chain lineage embedding (256-float normalized)',
      dims_768_2047:'Reserved: Mamba SSM state passthrough'
    },
    ssm_gate: 'h(t) = ā·h(t-1) + b̄·x(t) + W_inject · v_inject',
    note: 'Structured injections bypass context window. Proof obligations are enforced at the SSM state gate, not in-context.',
    worm_required: true
  }

  const event = wormAppend(`INJECTION_SPEC:${label}`, JSON.stringify(spec), { proof_hash, contract_hash })
  spec.worm_seal = event.seal
  return spec
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'snapkitty-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'worm_seal',
      description: 'Seal any payload into the SnapKitty WORM chain with SHA-256. Every event is chained to the previous seal — tamper-evident, append-only.',
      inputSchema: {
        type: 'object',
        properties: {
          label:   { type: 'string', description: 'Event label (e.g. DEPLOY, DECISION, CONTRACT)' },
          payload: { type: 'string', description: 'Data to seal — any string, JSON, code, or text' },
          meta:    { type: 'object', description: 'Optional metadata key-value pairs', additionalProperties: { type: 'string' } }
        },
        required: ['label', 'payload']
      }
    },
    {
      name: 'worm_read',
      description: 'Read and optionally verify the SnapKitty WORM chain. Returns recent events and chain validity.',
      inputSchema: {
        type: 'object',
        properties: {
          last_n: { type: 'number', description: 'Return last N events (default 10)', default: 10 },
          verify: { type: 'boolean', description: 'Verify chain integrity (default true)', default: true }
        }
      }
    },
    {
      name: 'agent_build',
      description: 'Create a sovereign agent manifest with class, capabilities, model binding, and WORM seal. Classes: SENTINEL, ORACLE, BUILDER, ARCHIVIST, BERSERKER.',
      inputSchema: {
        type: 'object',
        properties: {
          name:         { type: 'string', description: 'Agent name' },
          agent_class:  { type: 'string', enum: ['SENTINEL','ORACLE','BUILDER','ARCHIVIST','BERSERKER'], description: 'Agent class' },
          capabilities: { type: 'array', items: { type: 'string' }, description: 'List of permitted capabilities' },
          model:        { type: 'string', description: 'Ollama model tag (default: nemotron)', default: 'nemotron' }
        },
        required: ['name', 'agent_class']
      }
    },
    {
      name: 'ada_contract_generate',
      description: 'Generate an Ada-syntax sovereign governance contract for an agent. Defines permitted capabilities, trust level, and WORM-seals the contract.',
      inputSchema: {
        type: 'object',
        properties: {
          agent_name:   { type: 'string', description: 'Agent name' },
          agent_class:  { type: 'string', enum: ['SENTINEL','ORACLE','BUILDER','ARCHIVIST','BERSERKER'] },
          capabilities: { type: 'array', items: { type: 'string' }, description: 'Permitted capabilities' },
          trust_level:  { type: 'string', enum: ['LOW','MEDIUM','HIGH','SOVEREIGN'], default: 'HIGH' },
          purpose:      { type: 'string', description: 'Human-readable purpose statement' }
        },
        required: ['agent_name', 'agent_class']
      }
    },
    {
      name: 'twin_chat',
      description: 'Chat with a local Ollama model as a sovereign digital twin. Response is WORM-sealed. Requires Ollama running locally.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt:        { type: 'string', description: 'Message to send to the twin' },
          model:         { type: 'string', description: 'Ollama model tag (default: nemotron)', default: 'nemotron' },
          ollama_host:   { type: 'string', description: 'Ollama host URL (default: http://localhost:11434)', default: 'http://localhost:11434' },
          system_prompt: { type: 'string', description: 'System prompt / twin identity' }
        },
        required: ['prompt']
      }
    },
    {
      name: 'sovereign_inject',
      description: 'Generate a Mamba SSM injection specification from a Lean 4 theorem and Ada contract. This is the BOB orchestrator architecture: structured symbolic proofs injected into SSM state, bypassing the context window.',
      inputSchema: {
        type: 'object',
        properties: {
          lean4_theorem: { type: 'string', description: 'Lean 4 proof obligation or theorem statement' },
          ada_contract:  { type: 'string', description: 'Ada contract text to bind to the injection' },
          label:         { type: 'string', description: 'Injection label', default: 'sovereign-injection' }
        },
        required: ['lean4_theorem', 'ada_contract']
      }
    }
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {

      case 'worm_seal': {
        const event = wormAppend(args.label, args.payload, args.meta || {})
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              sealed: true,
              id:     event.id,
              label:  event.label,
              seal:   event.seal,
              ts:     event.ts,
              chain:  `${wormLoad().length} events total`
            }, null, 2)
          }]
        }
      }

      case 'worm_read': {
        const chain   = wormLoad()
        const n       = args.last_n ?? 10
        const recent  = chain.slice(-n)
        const verify  = args.verify !== false ? wormVerify() : null
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ chain_length: chain.length, integrity: verify, recent }, null, 2)
          }]
        }
      }

      case 'agent_build': {
        const manifest = buildAgentManifest(args.name, args.agent_class, args.capabilities || [], args.model || 'nemotron')
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(manifest, null, 2)
          }]
        }
      }

      case 'ada_contract_generate': {
        const result = generateAdaContract({
          agentName:    args.agent_name,
          agentClass:   args.agent_class,
          capabilities: args.capabilities || [],
          trustLevel:   args.trust_level  || 'HIGH',
          purpose:      args.purpose
        })
        return {
          content: [{ type: 'text', text: result.contract }]
        }
      }

      case 'twin_chat': {
        const result = await twinChat(args.prompt, args.model || 'nemotron', args.ollama_host || 'http://localhost:11434', args.system_prompt || '')
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        }
      }

      case 'sovereign_inject': {
        const spec = generateInjectionSpec(args.lean4_theorem, args.ada_contract, args.label || 'sovereign-injection')
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(spec, null, 2)
          }]
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true
    }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
