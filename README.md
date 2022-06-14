# Deploy to Kubernetes Action

This action will run the `kubectl` commands to deploy an image to Kubernetes, and create all of the relevant release tracking information in Github's Deployments.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `token` | **yes** | | Github Token (to create the Deployment record). Typically provide `${{ secrets.GITHUB_TOKEN }}`. |
| `namespace` | no | | Namespace of the Kubernetes Deployment |
| `deployment` | **yes** | | Deployment name |
| `container` | **yes** | | Container name within the deployment |
| `image` | **yes** | | Image to set in the container |
| `environment` | **yes** | | Github environment name |
| `ref` | no | Current commit hash | `ref` to attach to the deployment |
| `production` | no | (varies) | Boolean indicating if this is an environment users will interact with |
| `transient` | no | (varies) | Boolean indicating if this is an environment that may go away in the future |
| `url` | no | | URL for where the deployment is accessible |
| `wait` | no | `true` | Whether to wait for the rollout to complete before finishing |
| `wait-timeout` | no | `5m` | Maximum time to wait for the rollout. If this timeout is reached, the step will fail and the deployment will be marked as failed on GitHub. Ignored if `wait` is `false`. |

## Outputs

| Output | Description |
|---|---|
| | |

## Status tracking

Starting in `v0.3.0`, this action will by default watch the rollout in the cluster and try to keep the status in GitHub in sync.
If the rollout does not complete within the timeout window (`wait-timeout`), the Deployment will be marked as failed.
It is advisable to tune the timeout based on your deployment circimstances; any value accepted by the `kubectl rollout status`'s `--timeout` flag will work (`3s`, `5m`, etc).

Note: long deployments will result in increased billable time.
To disable rollout tracking entirely, run this action with `wait: false`.
This will cause the step to finish when the deployment command is _run_ without regard for completion or success (beyond the command failing outright), which was the default behavior in previous versions.
If you deploy very frequently, your deployments take a long time, or are cost-sensitive, this may be a better choice for you.
See [About billing for GitHub Actions](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions) for more info.

## Authentication

This action uses `kubectl` internally to deploy images; you must already be authenticated to the cluster (and be using the correct context).

Depending on a number of factors (e.g. managed vs self-run, which provder, etc.), this process can be cluster-specific.
If you are deploying to a managed Kubernetes cluster, it's best to follow any guidance they offer on how to securely authenticate within Github Actions.

However, a bare-minimum guide is included in [AUTHENTICATION.md](AUTHENTICATION.md).

## Example

The following Actions workflow file will:

- Authenticate to the cluster
- Deploy the image

```yaml
on:
  push:
    branches:
      - main

jobs:
  deploy:
    name: Deploy head of main to prod
    runs-on: ubuntu-latest
    steps:

      - name: Get GKE credentials
        uses: google-github-actions/get-gke-credentials@main
        with:
          cluster_name: ${{ secrets.GKE_CLUSTER_NAME }}
          location: ${{ secrets.GKE_CLUSTER_LOCATION }}
          credentials: ${{ secrets.GCP_SA_KEY }}

      - uses: firehed/deploy-to-kubernetes-action@v0.3.0
        with:
          namespace: github-actions
          deployment: www
          container: server
          image: my/image:${{ github.sha }}
          token: ${{ secrets.GITHUB_TOKEN }}
```

## Known issues/Future features

- You must authenticate to your cluster before this action
- Specifically if using Google's `get-gke-credentials` action, if you are checking out code during the workflow job, you must do so before running that step (it creates a file, and checking out code after will remove that file)
- Due to some conflicting magic behavior on Github's end, use of this action will produce strange results if used in conjunction with `jobs.<job_id>.environment` configuration.
  See [#4](https://github.com/Firehed/deploy-to-kubernetes-action/pull/4#issuecomment-897798467)
