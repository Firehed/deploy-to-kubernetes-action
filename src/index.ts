import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'

import {
  getTargetEnvironment,
  getOctokit,
  getRef,
} from './helpers'

type DeploymentStatusStates =
  | 'error'
  | 'failure'
  | 'inactive'
  | 'in_progress'
  | 'queued'
  | 'pending'
  | 'success'

async function run(): Promise<void> {
  let deploymentId: number|undefined = undefined
  try {
    await core.group('Check environment setup', envCheck)
    // const previousDeploymentId = await core.group('Finding previous deployment', findPreviousDeployment)
    // core.info(`Previous deployment: ${previousDeploymentId}`)
    deploymentId = await core.group('Set up Github deployment', createDeployment)
    await core.group('Deploy', async () => deploy(deploymentId!))
    // await core.group('Update status', async () => post(deploymentId!))
  } catch (error) {
    // update to failed?
    core.setFailed(error.message)
    if (deploymentId) {
      await createDeploymentStatus(deploymentId, 'failure')
    }
  }
}

async function envCheck(): Promise<void> {
  core.debug(JSON.stringify(process.env))
  // Check that kubectl is available
  // check that KUBECONFIG var is set and path exists
  await exec.exec('kubectl version')
  await exec.exec('kubectl config get-contexts')
  // check that it can talk to the cluster?
  // try to provide helpful messages if not in a usable state
}

async function createDeployment(): Promise<number> {
  const ok = getOctokit()

  let ref = core.getInput('ref')
  if (ref === '') {
    ref = getRef()
  }

  const environment = getTargetEnvironment()
  // Pass the production and transient flags only if they're provided by the
  // action's inputs. If they are, cast the strings to native booleans.
  const production = core.getInput('production')
  const production_environment = production === '' ? undefined : production === 'true'
  const transient = core.getInput('transient')
  const transient_environment = transient === '' ? undefined : transient === 'true'

  const params = {
    ref,
    environment,
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    auto_merge: false,
    production_environment,
    transient_environment,
    required_contexts: [], // This permits the deployment to be created at all; by default, this action running causes creation to fail because it's still pending. This should be made configurable
  }
  core.debug(JSON.stringify(params))
  const deploy = await ok.rest.repos.createDeployment(params)
  core.debug(JSON.stringify(deploy))

  // @ts-ignore
  const deploymentId: number = deploy.data.id
  core.info(`Created deployment ${deploymentId}`)

  // Immediately set the deployment to pending; it defaults to queued
  createDeploymentStatus(deploymentId, 'pending')
  return deploymentId
}
async function deploy(deploymentId: number): Promise<void> {
  const args = [
    'set',
    'image',
    'deployment',
  ]

  const namespace = core.getInput('namespace')
  if (namespace !== '') {
    args.push(`--namespace=${namespace}`)
  }

  const deployment = core.getInput('deployment')
  args.push(deployment)

  const container = core.getInput('container')
  const image = core.getInput('image')
  args.push(`${container}=${image}`)

  args.push('--record=true')
  args.push('--output=json') // This allows getting the new revision from the response to watch the rollout

  await createDeploymentStatus(deploymentId, 'in_progress')
  // Run the actual deployment command
  // TODO: figure out how to control output logging
  const deploymentOutput = await exec.getExecOutput('kubectl', args, { ignoreReturnCode: true })
  core.debug(JSON.stringify(deploymentOutput))
  if (deploymentOutput.exitCode > 0) {
    throw new Error('kubectl deployment command failed')
  }


  // Parse response; wait for k8s to complete if desired
  const deploymentStatus = JSON.parse(deploymentOutput.stdout)
  const revision = deploymentStatus.metadata.annotations['deployment.kubernetes.io/revision']
  core.debug(revision)

  const wait = core.getBooleanInput('wait')
  const timeout = core.getInput('wait-timeout')

  if (wait) {
    await exec.exec('kubectl', [
      'rollout',
      'status',
      `deployment/${deployment}`,
      `--revision=${revision}`,
      `--timeout=${timeout}`,
    ])
    // TODO: if nonzero, set to failed
  }

  await createDeploymentStatus(deploymentId, 'success')
}

async function createDeploymentStatus(deploymentId: number, state: DeploymentStatusStates): Promise<void> {
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
  const result = await ok.rest.repos.createDeploymentStatus(params)
  core.debug(JSON.stringify(result))
}

run()
