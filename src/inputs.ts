import * as core from '@actions/core'

export type OutputTarget = 'env' | 'output' | 'all'

export interface ActionInputs {
  token: string
  /** Deployment environment name. Empty string means fetch repository-level variables. */
  environment: string
  owner: string
  repo: string
  outputTo: OutputTarget
  prefix: string
  include: string[]
  exclude: string[]
  /** 'none' | 'upper' | 'lower' — case transform applied to the injected name (after prefix). */
  nameCase: 'none' | 'upper' | 'lower'
  dryRun: boolean
  failOnEmpty: boolean
  overwrite: boolean
}

/**
 * Tolerant boolean input: returns `fallback` when the input is empty/unset, and
 * otherwise accepts the YAML 1.2 forms (true/True/TRUE/false/False/FALSE). This
 * avoids `core.getBooleanInput` throwing when a default-less value is empty.
 */
export function getBooleanInputWithDefault(name: string, fallback: boolean): boolean {
  const raw = core.getInput(name).trim()
  if (raw === '') return fallback
  if (['true', 'True', 'TRUE'].includes(raw)) return true
  if (['false', 'False', 'FALSE'].includes(raw)) return false
  throw new Error(
    `Invalid boolean for "${name}": "${raw}". Expected one of: true, True, TRUE, false, False, FALSE.`,
  )
}

/** Split a comma- and/or newline-separated list into trimmed, non-empty entries. */
export function parseList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function parseOutputTo(raw: string): OutputTarget {
  const value = raw.trim().toLowerCase()
  if (value === 'env' || value === 'output' || value === 'all') {
    return value
  }
  throw new Error(`Invalid "output-to": "${raw}". Expected one of: env, output, all.`)
}

function parseNameCase(raw: string): 'none' | 'upper' | 'lower' {
  const value = raw.trim().toLowerCase()
  if (value === '' || value === 'none') return 'none'
  if (value === 'upper' || value === 'uppercase') return 'upper'
  if (value === 'lower' || value === 'lowercase') return 'lower'
  throw new Error(`Invalid "name-case": "${raw}". Expected one of: none, upper, lower.`)
}

/** Resolve "owner/repo" from the `repository` input, falling back to GITHUB_REPOSITORY. */
function parseRepository(raw: string): { owner: string; repo: string } {
  const value = raw.trim() || process.env.GITHUB_REPOSITORY || ''
  const parts = value.split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid "repository": "${value}". Expected "owner/repo" format.`)
  }
  return { owner: parts[0], repo: parts[1] }
}

export function getInputs(): ActionInputs {
  const token = core.getInput('github-token', { required: true })
  const { owner, repo } = parseRepository(core.getInput('repository'))

  return {
    token,
    environment: core.getInput('environment').trim(),
    owner,
    repo,
    outputTo: parseOutputTo(core.getInput('output-to') || 'all'),
    prefix: core.getInput('prefix'),
    include: parseList(core.getInput('include')),
    exclude: parseList(core.getInput('exclude')),
    nameCase: parseNameCase(core.getInput('name-case')),
    dryRun: getBooleanInputWithDefault('dry-run', false),
    failOnEmpty: getBooleanInputWithDefault('fail-on-empty', false),
    overwrite: getBooleanInputWithDefault('overwrite', true),
  }
}
