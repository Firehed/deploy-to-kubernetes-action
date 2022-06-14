import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'

import {
  createDeploymentStatus,
  getTargetEnvironment,
  getOctokit,
  getRef,
} from './helpers'

type DeploymentId = number // Github's identifier

interface DeployInfo {
  namespace: string
  deployment: string
  container: string
  image: string
}

async function run(): Promise<void> {
  let deploymentId: number|undefined = undefined
  try {
    await core.group('Check environment setup', envCheck)
    // const previousDeploymentId = await core.group('Finding previous deployment', findPreviousDeployment)
    // core.info(`Previous deployment: ${previousDeploymentId}`)
    deploymentId = await core.group('Set up Github deployment', createDeployment)
    const deployInfo: DeployInfo = {
      namespace: core.getInput('namespace'),
      deployment: core.getInput('deployment'),
      container: core.getInput('container'),
      image: core.getInput('image'),
    }

    await core.group('Deploy', async () => deploy(deploymentId!, deployInfo))
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

async function createDeployment(): Promise<DeploymentId> {
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
  await createDeploymentStatus(deploymentId, 'pending')
  return deploymentId
}

async function deploy(deploymentId: DeploymentId, deployInfo: DeployInfo): Promise<void> {
  const args = [
    'set',
    'image',
    'deployment',
    `--namespace=${deployInfo.namespace}`,
    deployInfo.deployment,
    `${deployInfo.container}=${deployInfo.image}`,
    '--record=true',
    '--output=json', // This allows getting the new revision from the response to watch the rollout
  ]

  // Run the actual deployment command
  // TODO: figure out how to control output logging
  const deploymentOutput = await exec.getExecOutput('kubectl', args, { ignoreReturnCode: true })
  core.debug(JSON.stringify(deploymentOutput))
  if (deploymentOutput.exitCode > 0) {
    // TODO: include stderr in this message.
    throw new Error('kubectl deployment command failed')
  }

  const wait = core.getBooleanInput('wait')
  if (wait) {
    await trackDeploymentProgress(deploymentId, deployInfo, deploymentOutput.stdout)
  } else {
    // fire-and-forget: assume the command goes through. This reduces the
    // (billable!) runtime of the action, at the expense of GH status accuracy.
    await createDeploymentStatus(deploymentId, 'success')
  }

}

/**
 * This is a wrapper around the `kubectl rollout status` command to watch the
 * deployment and attempt to keep the Kubernetes status in sync with Github.
 *
 * In an ideal world, this would be managed by some sort of webhook where K8S
 * sends a request to GH, but I'm unaware of a reasonably straightforward way
 * to accomplish this (it may be possible through some sort of Admission
 * Controller, but that makes using this action WAY more complex and probably
 * less reliable).
 *
 * This step will move the deployment (which should start as `pending`) to
 * `in_progress`, then either `success` or `failed` depending on the outcome.
 * It can be skipped entirely (and should be, if the action is called with
 * `wait: false`).
 */
async function trackDeploymentProgress(
  deploymentId: DeploymentId,
  deployInfo: DeployInfo,
  kubectlStdout: string,
): Promise<void> {
  // Immediately track into "in progress"
  await createDeploymentStatus(deploymentId, 'in_progress')

  // There's a bunch of parts around the `kubectl set image` that don't _quite_
  // fit together nicely with `kubectl rollout history`, so this needs to patch
  // over some ugliness:
  //
  // - If rollout history is run without the `revision` flag, it can start
  // tracking a different rollout if one starts before the next finishes. While
  // this can be avoided with GHA's `concurrency` option, there's no way to
  // prevent this from external actors.
  //
  // - The revision flag's value doesn't seem to reliably come anywhere in the
  // output of the deployment update's output. Trying to get it with `rollout
  // history` creates a race condition, again with external actors.
  //
  // - If, for some reason, `set image deployment` changes nothing at all,
  // there's nothing returned from the command at all - it simply exits 0 with
  // no output on stdout.

  let revision: number

  if (kubectlStdout === '') {
    // There was no change to the deployment. No great choice here but to grab
    // the most recent rollout and hope we don't hit a race condition.
    const historyResult = await exec.getExecOutput('kubectl', [
      'rollout',
      'history',
      '--namespace', deployInfo.namespace,
      'deployment', deployInfo.deployment,
      '--output', 'json',
    ])
    const history = JSON.parse(historyResult.stdout)
    revision = parseInt(history.metadata.annotations['deployment.kubernetes.io/revision'], 10)
    core.debug(`Pulled revision from rollout history: ${revision}`)
  } else {
    const deploymentStatus = JSON.parse(kubectlStdout)
  // This appears to return the OLD revision. Bump it by 1.
    revision = parseInt(deploymentStatus.metadata.annotations['deployment.kubernetes.io/revision'], 10) + 1
    core.debug(`Calculated revision from set image: ${revision}`)
  }

  const rolloutStatusArgs = [
    'rollout',
    'status',
    '--namespace', deployInfo.namespace,
    'deployment', deployInfo.deployment,
    '--revision', `${revision}`,
    '--timeout', core.getInput('wait-timeout'),
  ]

  // Runs the command in "watch" mode. This will exit success after some period
  // of time if the deploy finishes, and will exit nonzero if it fails, times
  // out, or has some other problem.
  const exitCode = await exec.exec('kubectl', rolloutStatusArgs, { ignoreReturnCode: true })

  if (exitCode === 0) {
    await createDeploymentStatus(deploymentId, 'success')
  } else {
    await createDeploymentStatus(deploymentId, 'failure')
  }
}

run()
