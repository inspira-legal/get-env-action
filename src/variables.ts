import * as github from '@actions/github'

export interface RepoVariable {
  name: string
  value: string
}

/** Shape of a single item returned by the Actions "variables" endpoints. */
interface VariableItem {
  name: string
  value: string
}

export interface FetchParams {
  token: string
  owner: string
  repo: string
  /** Empty string => repository-level variables. */
  environment: string
}

/**
 * Fetch all variables for a repository or one of its deployment environments.
 *
 * Uses Octokit route-string pagination, which transparently follows every page
 * and flattens the `{ total_count, variables: [...] }` envelope these endpoints
 * return. Requires a token with read access to variables — the default
 * GITHUB_TOKEN generally cannot read repo/environment variables, so use a
 * fine-grained PAT or GitHub App token granting "Variables: read"
 * (and "Environments: read" for the environment scope).
 */
export async function fetchVariables(params: FetchParams): Promise<RepoVariable[]> {
  const octokit = github.getOctokit(params.token)
  const { owner, repo, environment } = params

  const items = environment
    ? await octokit.paginate<VariableItem>(
        'GET /repos/{owner}/{repo}/environments/{environment_name}/variables',
        { owner, repo, environment_name: environment, per_page: 100 },
      )
    : await octokit.paginate<VariableItem>('GET /repos/{owner}/{repo}/actions/variables', {
        owner,
        repo,
        per_page: 100,
      })

  return items.map((v) => ({ name: v.name, value: v.value }))
}
