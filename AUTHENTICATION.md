# Authenticating to a cluster

Before proceeding, check if there's already a guide or Action specific to your situation.
It is not practical to keep this document up to date for all cloud providers.

Now with that out of the way, the following approach _should_ work in any cluster; however, it requires exporting a `kubeconfig` and providing that as a Github Actions `secret`.
This grants a large amount of access to Github and Github Actions; this may be outside of your security comfort level.

The process below creates a `ServiceAccount` with limited permissions to edit `Deployment` resources within a single Kubernetes `namespace`.
Depending on your situation, you may want to use the default namespace and use `ClusterRole` and `ClusterRoleBinding` to grant access in _all_ namespaces.

This is a **starting point** and you will likely need to adjust to your own deployment needs.
Both the `name` and `namespace` are probably inapproprate for your cluster.
_You should adjust them before applying any of these changes_.
These may also need adjusting based on what version of Kubernetes you are running.

## Create a Service Account
This creates a "user" which can authenticate and perform various actions with the Kubernetes API.


```yaml
# Create a ServiceAccount
apiVersion: v1
kind: ServiceAccount
metadata:
  name: github-actions-demos
  namespace: github-actions
```
## Create a Role
This is a set of permissions.
To deploy, a user needs `list, get, patch` access to `Deployments` and `list` access to `Services`.

```yaml
# Create a role with the minimum set of permissions to deploy
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: github-actions-demos
  namespace: github-actions
rules:
  # List services
  - apiGroups:
      - ""
    resources:
      - services
    verbs:
      - list
  # List, get, and patch deployments
  - apiGroups:
      - apps
    resources:
      - deployments
    verbs:
      - list
      - get
      - patch
  # List replicasets. This is only necessary with `wait: true`
  - apiGroups:
      - apps
    resources:
      - replicasets
    verbs:
      - list
```

## Create a RoleBinding
This associates the two resources created above, allowing the `ServiceAccount` access to the resources specified by the `Role`.

```yaml
# Give the role to the service account
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: github-actions-demos
  namespace: github-actions
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: github-actions-demos
subjects:
  - kind: ServiceAccount
    name: github-actions-demos
    namespace: github-actions
```

## Generate a `kubeconfig` file
Now that these resources exist in the cluster, you will need to export the ServiceAccount's automatically-generated credentials for use by the action.
This is a little more manual.

```
kubectl describe serviceaccount --namespace github-actions github-actions-demos
```

Look for `Tokens` in the output, and copy the value.

```
kubectl get secret --namespace github-actions <token name from above> --output yaml
```

Next, we will need to manually construct a new `kubeconfig` file:

```yaml
apiVersion: v1
kind: Config
preferences: {}
clusters:
  - cluster:
      certificate-authority-data: # data/ca.crt from above
      server: https://some-url # get this from your personal kubeconfig
    name: my-cluster
users:
  - name: my-user
    user:
      as-user-extra: {}
      token: # base64-decoded value of data/token. Probably starts with `eyJ`
contexts:
  - context:
      cluster: my-cluster
      namespace: default
      user: my-user
    name: my-context
current-context: my-context
```

Finally, take this new file, base64-encode it, and save the base64 as a Github Actions Secret.
To use this, look at the contents of the `self-test.yml` workflow of this repository (you will need to substitute in your GHA secret name).



