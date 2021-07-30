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

## Outputs

| Output | Description |
|---|---|
| | |

## Example

The following Actions workflow file will:

- Authenticate to the clsuter
- Deploy the image

```yaml
on:
  push:
    branches:
      - main

jobs:
  build-and-test:
    name: Build and test
    runs-on: ubuntu-latest
    steps:

      - name: Get GKE credentials
        uses: google-github-actions/get-gke-credentials@main
        with:
          cluster_name: ${{ secrets.GKE_CLUSTER_NAME }}
          location: ${{ secrets.GKE_CLUSTER_LOCATION }}
          credentials: ${{ secrets.GCP_SA_KEY }}

      - uses: firehed/deploy-to-kubernetes@v1
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
