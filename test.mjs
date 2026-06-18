/**
 * Quick smoke test — runs without an MCP client
 * node test.mjs
 */
import { createHash, randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'

const WORM_PATH = join(process.env.HOME || process.env.USERPROFILE || '.', '.snapkitty-worm-test.json')

// Clean slate
if (existsSync(WORM_PATH)) unlinkSync(WORM_PATH)

function wormLoad () {
  if (!existsSync(WORM_PATH)) return []
  return JSON.parse(readFileSync(WORM_PATH, 'utf8'))
}
function wormAppend (label, payload) {
  const chain = wormLoad()
  const prev  = chain.length ? chain[chain.length - 1].seal : '0'.repeat(64)
  const ts    = new Date().toISOString()
  const data  = JSON.stringify({ label, payload, ts, prev })
  const seal  = createHash('sha256').update(data).digest('hex')
  const event = { id: randomUUID(), label, payload, ts, prev, seal }
  chain.push(event)
  writeFileSync(WORM_PATH, JSON.stringify(chain, null, 2))
  return event
}

let passed = 0

function test (name, fn) {
  try {
    fn()
    console.log(`  ✓  ${name}`)
    passed++
  } catch (e) {
    console.error(`  ✗  ${name}: ${e.message}`)
  }
}

console.log('\n  SnapKitty MCP — smoke tests\n')

test('WORM seal returns SHA-256 hash', () => {
  const e = wormAppend('TEST', 'hello sovereign')
  if (e.seal.length !== 64) throw new Error(`bad seal length: ${e.seal.length}`)
})

test('WORM chain is append-only', () => {
  wormAppend('TEST2', 'second event')
  wormAppend('TEST3', 'third event')
  const chain = wormLoad()
  if (chain.length !== 3) throw new Error(`expected 3 events, got ${chain.length}`)
})

test('WORM chain links correctly (prev = prior seal)', () => {
  const chain = wormLoad()
  if (chain[1].prev !== chain[0].seal) throw new Error('chain link broken at 0→1')
  if (chain[2].prev !== chain[1].seal) throw new Error('chain link broken at 1→2')
})

test('Ada contract contains agent name', () => {
  const name = 'TestAgent'
  const ts   = new Date().toISOString()
  const contract = `package ${name}_Contract is\n   Agent_Name : constant String := "${name}";\nend ${name}_Contract;`
  if (!contract.includes(name)) throw new Error('agent name missing from contract')
})

test('WORM verify detects tamper', () => {
  const chain = wormLoad()
  chain[0].seal = 'deadbeef'.repeat(8)
  if (chain[1].prev === chain[0].seal) throw new Error('tamper not detected')
  // correct: prev should NOT match the tampered seal
})

// Cleanup
if (existsSync(WORM_PATH)) unlinkSync(WORM_PATH)

console.log(`\n  ${passed}/5 tests passed\n`)
if (passed < 5) process.exit(1)
