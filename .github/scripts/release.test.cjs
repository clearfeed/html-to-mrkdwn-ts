const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const script = path.join(__dirname, 'release.cjs');
const manifest = { ...require('../../package.json'), version: '3.1.0' };
const workflow = fs.readFileSync(path.join(__dirname, '../workflows/publish.yml'), 'utf8');
// Exercise the actual privileged-job commands without granting OIDC or publishing.
const commands = [...workflow.matchAll(/          node <<'NODE'\n([\s\S]*?)          NODE/g)]
  .map(match => match[1].replace(/^          /gm, ''));

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'html-release-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest));
  return directory;
}

function run(directory, args, env = {}) {
  return spawnSync(process.execPath, args, {
    cwd: directory, encoding: 'utf8', env: { ...process.env, ...env },
  });
}

function expectResult(result, error) {
  assert(!result.error, String(result.error));
  if (error) {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, error);
  } else assert.equal(result.status, 0, result.stderr);
}

test('release command validates event, identity, tag, checkout and master ancestry', t => {
  const directory = fixture(t);
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'master');
  git('add', 'package.json');
  const commit = () => git('-c', 'user.name=Release test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
  commit();
  const sha = git('rev-parse', 'HEAD');
  git('update-ref', 'refs/remotes/origin/master', sha);
  git('-c', 'user.name=Release test', '-c', 'user.email=test@example.invalid', 'tag', '-a', `v${manifest.version}`, '-m', 'stable');
  const event = { action: 'published', release: { tag_name: `v${manifest.version}`, draft: false, prerelease: false } };
  const env = {
    GITHUB_EVENT_PATH: path.join(directory, 'event.json'), GITHUB_REPOSITORY: 'clearfeed/html-to-mrkdwn-ts',
    GITHUB_EVENT_NAME: 'release', GITHUB_REF: `refs/tags/v${manifest.version}`, GITHUB_SHA: sha,
  };
  const check = (input = event, overrides = {}) => {
    fs.writeFileSync(env.GITHUB_EVENT_PATH, JSON.stringify(input));
    return run(directory, [script, 'source'], { ...env, ...overrides });
  };
  expectResult(check());
  for (const change of [{ draft: true }, { prerelease: true }, { tag_name: 'v9.0.0' }]) {
    expectResult(check({ ...event, release: { ...event.release, ...change } }), /AssertionError/);
  }
  for (const change of [{ GITHUB_REPOSITORY: 'fork/html-to-mrkdwn-ts' }, { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_REF: 'refs/heads/master' }, { GITHUB_SHA: 'a'.repeat(40) }]) {
    expectResult(check(event, change), /AssertionError/);
  }
  for (const change of [{ name: 'html-to-mrkdwn-ts' }, { version: '3.1.0-rc.1' }, { version: '03.1.0' },
    { private: true }, { repository: { url: 'git+https://github.com/fork/html-to-mrkdwn-ts.git' } }]) {
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ ...manifest, ...change }));
    expectResult(check(), /AssertionError/);
  }
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest));
  git('checkout', '-b', 'unmerged');
  fs.writeFileSync(path.join(directory, 'extra.txt'), 'unmerged');
  git('add', 'extra.txt');
  commit();
  const unmerged = git('rev-parse', 'HEAD');
  expectResult(check(event, { GITHUB_SHA: unmerged }), /Tag moved/);
  git('tag', '-f', `v${manifest.version}`);
  expectResult(check(event, { GITHUB_SHA: unmerged }), /merge-base --is-ancestor/);
});

test('both registry checks reject duplicates, downgrades, bad metadata and lookup failures', t => {
  const directory = fixture(t);
  const bytes = Buffer.from('validated artifact');
  const filename = `clearfeed-ai-html-to-mrkdwn-ts-${manifest.version}.tgz`;
  fs.writeFileSync(path.join(directory, filename), bytes);
  const env = { PACKAGE_VERSION: manifest.version, PACKAGE_FILE: filename,
    PACKAGE_SHA256: crypto.createHash('sha256').update(bytes).digest('hex'), GITHUB_REF: `refs/tags/v${manifest.version}` };
  const metadata = { name: manifest.name, versions: {}, 'dist-tags': { latest: '3.0.1' } };
  const preload = path.join(directory, 'registry.cjs');
  const commandsToRun = [[script, 'registry'], ['-e', commands[0]]];
  const cases = [
    [metadata, 200, null],
    [{ ...metadata, versions: { [manifest.version]: {} } }, 200, /already published/],
    ...['3.1.0', '3.10.0', '4.0.0', '3.2.0-rc.1'].map(latest => [
      { ...metadata, 'dist-tags': { latest } }, 200, /advance latest|stable version|regular expression/,
    ]),
    [{ ...metadata, name: 'wrong-package' }, 200, /AssertionError/],
    [metadata, 404, /Registry lookup failed: 404/],
    [metadata, 503, /Registry lookup failed: 503/],
  ];
  for (const [body, status, error] of cases) {
    fs.writeFileSync(preload, `global.fetch = async () => new Response(${JSON.stringify(JSON.stringify(body))}, { status: ${status} });`);
    for (const command of commandsToRun) expectResult(run(directory, ['--require', preload, ...command], env), error);
  }
  fs.writeFileSync(preload, `global.fetch = async () => new Response(${JSON.stringify(JSON.stringify(metadata))});`);
  expectResult(run(directory, ['--require', preload, '-e', commands[0]], { ...env, PACKAGE_SHA256: '0'.repeat(64) }), /AssertionError/);
});

test('post-publish verification checks latest, registry integrity and exact downloaded bytes', t => {
  const directory = fixture(t);
  const bytes = Buffer.from('accepted tarball bytes');
  const tarball = `https://registry.npmjs.org/@clearfeed-ai/html-to-mrkdwn-ts/-/html-to-mrkdwn-ts-${manifest.version}.tgz`;
  const integrity = `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}`;
  const metadata = { 'dist-tags': { latest: manifest.version }, versions: {
    [manifest.version]: { dist: { tarball, integrity } },
  } };
  const preload = path.join(directory, 'registry.cjs');
  const check = (body, download, error) => {
    fs.writeFileSync(preload, `global.fetch = async url => new Response(String(url).includes('.tgz?') ?
      Buffer.from(${JSON.stringify(download.toString('base64'))}, 'base64') : ${JSON.stringify(JSON.stringify(body))});`);
    expectResult(run(directory, ['--require', preload, '-e', commands[1]], {
      PACKAGE_VERSION: manifest.version, PACKAGE_SHA256: crypto.createHash('sha256').update(bytes).digest('hex'),
    }), error);
  };
  check(metadata, bytes);
  check(metadata, Buffer.from('different package'), /AssertionError/);
  check({ ...metadata, 'dist-tags': { latest: '3.0.1' } }, bytes, /AssertionError/);
  check({ ...metadata, versions: { [manifest.version]: { dist: { tarball, integrity: 'sha512-wrong' } } } }, bytes, /AssertionError/);
});
