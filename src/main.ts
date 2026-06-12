import * as core from '@actions/core'
import { getInputs, type ActionInputs } from './inputs'
import { isAllowed } from './filter'
import { fetchVariables, type RepoVariable } from './variables'

/** Apply prefix + case transform to produce the injected variable name. */
export function transformName(name: string, inputs: ActionInputs): string {
  const withPrefix = `${inputs.prefix}${name}`
  switch (inputs.nameCase) {
    case 'upper':
      return withPrefix.toUpperCase()
    case 'lower':
      return withPrefix.toLowerCase()
    default:
      return withPrefix
  }
}

export async function run(): Promise<void> {
  const inputs = getInputs()

  const source = inputs.environment
    ? `environment "${inputs.environment}" of ${inputs.owner}/${inputs.repo}`
    : `repository ${inputs.owner}/${inputs.repo}`
  core.info(`Fetching variables from ${source}…`)

  let variables: RepoVariable[]
  try {
    variables = await fetchVariables({
      token: inputs.token,
      owner: inputs.owner,
      repo: inputs.repo,
      environment: inputs.environment,
    })
  } catch (error) {
    const status = (error as { status?: number }).status
    const message = error instanceof Error ? error.message : String(error)
    if (status === 404) {
      throw new Error(
        `Could not read variables from ${source} (404). ` +
          `Verify the repository/environment exists and the token has "Variables: read" access.`,
      )
    }
    if (status === 403 || status === 401) {
      throw new Error(
        `Access denied reading variables from ${source} (${status}). ` +
          `The default GITHUB_TOKEN cannot read variables — use a fine-grained PAT or GitHub App token.`,
      )
    }
    throw new Error(`Failed to fetch variables from ${source}: ${message}`)
  }

  const selected = variables.filter((v) => isAllowed(v.name, inputs.include, inputs.exclude))

  core.info(
    `Found ${variables.length} variable(s); ${selected.length} selected after include/exclude filters.`,
  )

  if (selected.length === 0 && inputs.failOnEmpty) {
    throw new Error('No variables matched and "fail-on-empty" is true.')
  }

  const injectedNames: string[] = []
  const collected: Record<string, string> = {}

  for (const variable of selected) {
    const targetName = transformName(variable.name, inputs)
    collected[targetName] = variable.value
    injectedNames.push(targetName)

    if (inputs.dryRun) {
      core.info(`[dry-run] would set ${targetName} (length=${variable.value.length})`)
      continue
    }

    if (inputs.outputTo === 'env' || inputs.outputTo === 'all') {
      if (!inputs.overwrite && process.env[targetName] !== undefined) {
        core.warning(`Skipping env "${targetName}" — already set and overwrite=false.`)
      } else {
        core.exportVariable(targetName, variable.value)
      }
    }

    if (inputs.outputTo === 'output' || inputs.outputTo === 'all') {
      core.setOutput(targetName, variable.value)
    }
  }

  // Aggregate, machine-readable outputs.
  core.setOutput('variables', JSON.stringify(collected))
  core.setOutput('names', injectedNames.join(','))
  core.setOutput('count', String(injectedNames.length))

  await writeSummary(inputs, source, injectedNames)

  core.info(
    inputs.dryRun
      ? `Dry run complete — ${injectedNames.length} variable(s) would be injected.`
      : `Injected ${injectedNames.length} variable(s) (target: ${inputs.outputTo}).`,
  )
}

async function writeSummary(
  inputs: ActionInputs,
  source: string,
  names: string[],
): Promise<void> {
  try {
    core.summary
      .addHeading('Get Environment Variables', 3)
      .addRaw(`Source: ${source}`)
      .addBreak()
      .addRaw(`Target: \`${inputs.outputTo}\`${inputs.dryRun ? ' (dry-run)' : ''}`)
      .addBreak()
      .addRaw(`Injected: **${names.length}** variable(s)`)
    if (names.length > 0) {
      core.summary.addList(names.map((n) => `\`${n}\``))
    }
    await core.summary.write()
  } catch {
    // Summary is best-effort; never fail the action because of it.
  }
}
