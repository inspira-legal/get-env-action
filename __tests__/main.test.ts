import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mock @actions/core --------------------------------------------------
const inputs: Record<string, string> = {}
const setOutputs: Record<string, string> = {}
const exportedEnv: Record<string, string> = {}
const failures: string[] = []
const warnings: string[] = []

vi.mock('@actions/core', () => {
  const summary = {
    addHeading: () => summary,
    addRaw: () => summary,
    addBreak: () => summary,
    addList: () => summary,
    write: async () => summary,
  }
  return {
    getInput: (name: string) => inputs[name] ?? '',
    getBooleanInput: (name: string) => (inputs[name] ?? 'false').toLowerCase() === 'true',
    setOutput: (name: string, value: string) => {
      setOutputs[name] = value
    },
    exportVariable: (name: string, value: string) => {
      exportedEnv[name] = value
    },
    info: () => {},
    warning: (msg: string) => warnings.push(msg),
    setFailed: (msg: string) => failures.push(msg),
    summary,
  }
})

// --- Mock the GitHub fetch layer ----------------------------------------
const fetchMock = vi.fn()
vi.mock('../src/variables', () => ({
  fetchVariables: (...args: unknown[]) => fetchMock(...args),
}))

import { run, transformName } from '../src/main'
import type { ActionInputs } from '../src/inputs'

function setInputs(overrides: Record<string, string>): void {
  for (const key of Object.keys(inputs)) delete inputs[key]
  Object.assign(inputs, {
    'github-token': 'tok',
    repository: 'acme/widgets',
    'output-to': 'all',
    ...overrides,
  })
}

beforeEach(() => {
  for (const k of Object.keys(setOutputs)) delete setOutputs[k]
  for (const k of Object.keys(exportedEnv)) delete exportedEnv[k]
  failures.length = 0
  warnings.length = 0
  fetchMock.mockReset()
})

describe('transformName', () => {
  const base = { prefix: 'P_', nameCase: 'none' } as ActionInputs
  it('applies prefix', () => {
    expect(transformName('FOO', base)).toBe('P_FOO')
  })
  it('applies upper/lower case to prefix+name', () => {
    expect(transformName('foo', { ...base, nameCase: 'upper' })).toBe('P_FOO')
    expect(transformName('FOO', { ...base, prefix: '', nameCase: 'lower' })).toBe('foo')
  })
})

describe('run', () => {
  it('injects to env and outputs, plus aggregate outputs', async () => {
    setInputs({})
    fetchMock.mockResolvedValue([
      { name: 'API_URL', value: 'https://x' },
      { name: 'API_KEY', value: 'abc' },
    ])

    await run()

    expect(failures).toEqual([])
    expect(exportedEnv).toEqual({ API_URL: 'https://x', API_KEY: 'abc' })
    expect(setOutputs.API_URL).toBe('https://x')
    expect(setOutputs.count).toBe('2')
    expect(setOutputs.names).toBe('API_URL,API_KEY')
    expect(JSON.parse(setOutputs.variables)).toEqual({ API_URL: 'https://x', API_KEY: 'abc' })
  })

  it('respects include/exclude and prefix', async () => {
    setInputs({ include: 'AWS_*', exclude: '*_SECRET', prefix: 'STG_' })
    fetchMock.mockResolvedValue([
      { name: 'AWS_REGION', value: 'eu' },
      { name: 'AWS_SECRET', value: 's' },
      { name: 'OTHER', value: 'o' },
    ])

    await run()

    expect(Object.keys(exportedEnv)).toEqual(['STG_AWS_REGION'])
    expect(setOutputs.count).toBe('1')
  })

  it('output-to=env does not set per-variable step outputs', async () => {
    setInputs({ 'output-to': 'env' })
    fetchMock.mockResolvedValue([{ name: 'FOO', value: 'bar' }])

    await run()

    expect(exportedEnv.FOO).toBe('bar')
    expect(setOutputs.FOO).toBeUndefined()
    expect(setOutputs.count).toBe('1')
  })

  it('dry-run sets nothing but still reports count', async () => {
    setInputs({ 'dry-run': 'true' })
    fetchMock.mockResolvedValue([{ name: 'FOO', value: 'bar' }])

    await run()

    expect(exportedEnv).toEqual({})
    expect(setOutputs.FOO).toBeUndefined()
    expect(setOutputs.count).toBe('1')
  })

  it('fail-on-empty throws when nothing matches', async () => {
    setInputs({ 'fail-on-empty': 'true', include: 'NOPE_*' })
    fetchMock.mockResolvedValue([{ name: 'FOO', value: 'bar' }])

    await expect(run()).rejects.toThrow(/fail-on-empty/)
  })

  it('maps 403 to an actionable error message', async () => {
    setInputs({})
    fetchMock.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))

    await expect(run()).rejects.toThrow(/default GITHUB_TOKEN cannot read variables/)
  })
})
