[![npm version](https://badge.fury.io/js/html-to-mrkdwn-ts.svg)](https://badge.fury.io/js/html-to-mrkdwn-ts)
![npm downloads](https://img.shields.io/npm/dm/html-to-mrkdwn-ts?style=flat-square)
![Build Status](https://github.com/oferitz/html-to-mrkdwn-ts/workflows/Build%20(CI)/badge.svg)

# html-to-mrkdwn-ts
html-to-mrkdwn-ts is a _fast_ HTML to [Slack flavored markdown](https://api.slack.com/reference/surfaces/formatting) converter.

## Install

```sh
<yarn|npm|pnpm> html-to-mrkdwn-ts
```

## Usage

```ts
import htmlToMrkdwn from 'html-to-mrkdwn-ts'
const html = `
<div>
  <h1>A Title</h1>
  <a href="https://foo.bar">
    <img src="https://foo.bar/baz.jpg" alt="baz" />
  </a>
</div>`

htmlToMrkdwn(html)

// {
//   image: 'https://foo.bar/baz.jpg',
//   text: '*A Title*\n\n<https://foo.bar|baz>'
// }
```

## Options
under the hood html-to-mrkdwn-ts uses [node-html-markdown](https://github.com/crosstype/node-html-markdown/blob/master/README.md) 
so you can pass an additional options as a second argument:
```ts
htmlToMrkdwn(html, { strongDelimiter: '**' })
```


see available [options](https://github.com/crosstype/node-html-markdown/blob/master/README.md#options)

## Publishing the ClearFeed package

This fork publishes `@clearfeed-ai/html-to-mrkdwn-ts`. The `Build (CI)` workflow
in `.github/workflows/publish.yml` validates pull requests and pushes to `master`.
Publishing a stable GitHub Release triggers npm publishing through GitHub OIDC.
Pushing a tag alone does not publish. Draft releases and prereleases are skipped.

Validation uses the existing Yarn v1 lockfile and its dependency resolutions,
runs the formatter check and full tests, and builds `lib/` twice from scratch.
Both npm tarballs must be byte-identical. It checks the package contents, runs
the packed CommonJS entry point, and compiles a consumer of its TypeScript
declarations. Only a separate publish job has `id-token: write`; it downloads
the validated tarball without checking out source or installing project dependencies.

### Activation requires separate maintainer approval

After merging this workflow, an npm maintainer can add this connection in
[package settings → Trusted Publisher](https://www.npmjs.com/package/@clearfeed-ai/html-to-mrkdwn-ts/access):

| Setting | Proposed value |
| --- | --- |
| Provider | GitHub Actions |
| npm package | `@clearfeed-ai/html-to-mrkdwn-ts` |
| Organization or user | `clearfeed` |
| Repository | `html-to-mrkdwn-ts` |
| Workflow filename | `publish.yml` |
| Environment name | Leave blank; this workflow does not use a GitHub environment |
| Allow npm publish | Enabled |
| Allow npm dist-tag | Disabled |

Saving the connection grants persistent publishing authority to this workflow.
npm also permits `npm stage publish` for every trusted publisher. Approve this
configuration separately from the code change; no npm access configuration,
tokens, secrets, or 2FA changes are part of this PR. Existing manual publishing
remains available. Changes to the workflow affect publishing authority.

Create the connection when the next real release is ready. npm requires a first
successful publish within **two days**, which validates the connection and binds
it to the repository's immutable identity. An expired connection must be deleted
and recreated. Do not publish a dummy version to activate it. The workflow file
must exist in the repository when configuring trust; use just `publish.yml`, not
its full path. Existing trust connections cannot be edited to change their fields.

The workflow uses GitHub-hosted `ubuntu-24.04`, Node `24.22.0`, npm `11.19.1`,
and Yarn `1.22.22`, with actions pinned to commit SHAs and dependency caches
disabled. npm currently requires Node ≥22.14.0 and npm ≥11.5.1 for trusted
publishing, and does not support self-hosted runners. GitHub OIDC automatically
adds provenance for this public repository and package. See the
[official npm requirements](https://docs.npmjs.com/trusted-publishers/).

### Release procedure

1. Merge the reviewed code and `package.json` version bump into `master`, keeping
   `yarn.lock` consistent with any dependency changes. `lib/` is generated in CI
   and is not committed in this repository.
2. Publish a stable GitHub Release with tag `vX.Y.Z` pointing to that commit.
   The tag must exactly match the package version. The release commit must be
   reachable from `master`; versions already on npm and versions that do not
   advance `latest` are rejected. Historical bare tags (`2.0.0`, `2.0.1`) do not
   meet this release convention.
3. Follow `Build (CI)`. The publish job checks the artifact digest and reads the
   registry again before publishing the exact tarball with `--ignore-scripts`.
   Release runs are serialized. Avoid concurrent manual npm publishes, which
   cannot participate in GitHub's concurrency lock.
4. The workflow waits up to 15 minutes for npm to expose the version, verifies
   `latest`, then downloads the tarball and checks both its SHA-256 against the
   build and SHA-512 against registry metadata. If verification times out after
   upload, inspect npm processing before taking any further publishing action.
   Reruns reject a version that is already published.

For local validation with the pinned toolchain:

```sh
yarn install --frozen-lockfile --ignore-scripts
node --test .github/scripts/release.test.cjs
yarn prettier --check 'src/**/*.ts'
yarn test --runInBand
rm -rf lib
yarn build
npm pack --ignore-scripts --json > /tmp/html-to-mrkdwn-pack.json
node .github/scripts/release.cjs pack /tmp/html-to-mrkdwn-pack.json
```

The guard tests simulate registry responses and use temporary Git repositories;
they never publish or request an OIDC token. `node .github/scripts/release.cjs
registry` performs a read-only live eligibility check and intentionally fails
when the local version is already published.
