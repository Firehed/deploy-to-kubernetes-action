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

## Outputs

| Output | Description |
|---|---|
| | |

## Authentication
This action uses `kubectl` internally to deploy images; you must already be authenticated to the cluster (and be using the correct context).

Depending on a number of factors (e.g. managed vs self-run, which provder, etc.), this process can be cluster-specific.
If you are deploying to a managed Kubernetes cluster, it's best to follow any guidance they offer on how to securely authenticate within Github Actions.

However, a bare-minimum guide is included in [AUTHENTICATION.md]().

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

      - uses: firehed/deploy-to-kubernetes-action@v1
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
