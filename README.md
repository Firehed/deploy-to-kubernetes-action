

# Deploy to Kubernetes Action



This action is designed to perform multistage Docker builds in a straightforward and fast way.
As it turns out, this is surprisingly difficult to do well in CI, since the host machine performing the build typically starts in a clean slate each time, which means most of the layer caching used by Docker becomes moot.
Trying to use Github's `actions/cache` to work around this can be quite challenging, and manually dealing with each stage in the build requires a lot of repetition in the Action YAML.

The inputs to this action allow you to specify the various build stage names as cache targets that will be created and pushed to the registry for future re-use.
Each stage will be tagged using the branch name and full commit hash.
While the initial build will, of course, be performed from scratch, subsequent builds will pull the previously-built images that the layer caching can use.


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

- Install kubectl
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

      - name: Setup gcloud CLI
        uses: google-github-actions/setup-gcloud@master
        with:
          export_default_credentials: true
          project_id: ${{ secrets.GKE_PROJECT }}
          service_account_email: ${{ secrets.GCP_SA_EMAIL }}
          service_account_key: ${{ secrets.GCP_SA_KEY }}

      - name: Get GKE credentials
        uses: google-github-actions/get-gke-credentials@main
        with:
          cluster_name: ${{ secrets.GKE_CLUSTER_NAME }}
          location: ${{ secrets.GKE_CLUSTER_LOCATION }}

      - uses: firehed/deploy-to-kubernetes@v1
        with:
          namespace: github-actions
          deployment: www
          container: server
          image: my/image:${{ github.sha }}
          token: ${{ secrets.GITHUB_TOKEN }}
```

## Known issues/Future features

- must run kubectl setup before this action
- must auth to cluster before this action
