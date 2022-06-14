import * as core from '@actions/core'
import * as github from '@actions/github'

export function getRef(): string {
  const pullRequestEvents = [
    'pull_request',
    'pull_request_review',
    'pull_request_review_comment',
  ]
  if (pullRequestEvents.includes(github.context.eventName)) {
    const prEvent = github.context.payload.pull_request as unknown as any
    return prEvent.head.sha
  }
  return github.context.sha
}

export function getOctokit() {
  const token = core.getInput('token')
  return github.getOctokit(token)
}

export function getTargetEnvironment(): string {
  return core.getInput('environment')
}

// These are declared roughly in order of state flow
type DeploymentStatusStates =
  | 'queued'
  | 'pending'
  | 'in_progress'
  | 'success'
  | 'error'
  | 'failure'
  | 'inactive'

export async function createDeploymentStatus(deploymentId: number, state: DeploymentStatusStates): Promise<void> {
  const ok = getOctokit()

  let environment_url: string | undefined = core.getInput('url')
  if (environment_url === '') {
    environment_url = undefined
  }

  const params = {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    deployment_id: deploymentId,
    state,
    auto_inactive: true,
    environment_url,
  }
  core.info(`Updating GitHub deployment status to ${state}`)
  const result = await ok.rest.repos.createDeploymentStatus(params)
  core.debug(JSON.stringify(result))
}
