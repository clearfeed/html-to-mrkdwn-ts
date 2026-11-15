const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const name = '@clearfeed-ai/html-to-mrkdwn-ts';
const repository = 'clearfeed/html-to-mrkdwn-ts';
const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

async function main() {
  const manifest = JSON.parse(fs.readFileSync('package.json'));
  assert.equal(manifest.name, name, 'Unexpected package');
  assert.match(manifest.version, stable, 'Only stable versions can be released');
  assert.equal(manifest.repository.url, `git+https://github.com/${repository}.git`);
  assert(!manifest.private, 'Package must be public');
  const version = manifest.version;

  switch (process.argv[2]) {
    case 'source': {
      const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH));
      assert.equal(process.env.GITHUB_REPOSITORY, repository);
      assert.equal(process.env.GITHUB_EVENT_NAME, 'release');
      assert.equal(event.action, 'published');
      assert.equal(event.release.draft, false);
      assert.equal(event.release.prerelease, false);
      assert.equal(event.release.tag_name, `v${version}`, 'Tag must match package version');
      assert.equal(process.env.GITHUB_REF, `refs/tags/v${version}`);
      assert.equal(git('rev-parse', 'HEAD'), process.env.GITHUB_SHA, 'Checkout must match release commit');
      assert.equal(git('rev-parse', `${process.env.GITHUB_REF}^{commit}`), process.env.GITHUB_SHA, 'Tag moved');
      execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'refs/remotes/origin/master']);
      break;
    }
    case 'registry': {
      const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
        signal: AbortSignal.timeout(30000),
      });
      assert(response.ok, `Registry lookup failed: ${response.status}`);
      const metadata = await response.json();
      assert.equal(metadata.name, name);
      assert(!metadata.versions[version], 'Version is already published');
      const latest = metadata['dist-tags'].latest;
      assert.match(latest, stable, 'latest must be a stable version');
      const requested = version.split('.').map(BigInt);
      const previous = latest.split('.').map(BigInt);
      const difference = requested.findIndex((part, index) => part !== previous[index]);
      assert(difference >= 0 && requested[difference] > previous[difference], 'Release must advance latest');
      break;
    }
    case 'pack': {
      const [pack] = JSON.parse(fs.readFileSync(process.argv[3]));
      assert.equal(pack.name, name);
      assert.equal(pack.version, version);
      assert.equal(pack.filename, `clearfeed-ai-html-to-mrkdwn-ts-${version}.tgz`);
      assert.equal(manifest.main, 'lib/index.js');
      assert.equal(manifest.types, 'lib/index.d.ts');
      // Every TypeScript source must ship its JavaScript, declarations and source map.
      const expected = ['package.json', 'README.md'];
      if (fs.existsSync('CHANGELOG.md')) expected.push('CHANGELOG.md');
      for (const file of fs.readdirSync('src', { recursive: true })) {
        if (file.endsWith('.ts')) {
          for (const extension of ['.js', '.js.map', '.d.ts']) {
            expected.push(`lib/${file.slice(0, -3)}${extension}`);
          }
        }
      }
      assert.deepEqual(pack.files.map(file => file.path).sort(), expected.sort(), 'Unexpected package contents');
      const filename = path.resolve(process.argv[4] || '.', pack.filename);
      const bytes = fs.readFileSync(filename);
      assert.equal(`sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}`, pack.integrity);
      const entries = execFileSync('tar', ['-tzf', filename], { encoding: 'utf8' }).trim().split('\n');
      assert.deepEqual(entries.sort(), expected.map(file => `package/${file}`).sort());
      const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'html-mrkdwn-pack-'));
      try {
        execFileSync('tar', ['-xzf', filename, '-C', temporary]);
        fs.symlinkSync(path.resolve('node_modules'), path.join(temporary, 'node_modules'), 'dir');
        const packed = JSON.parse(fs.readFileSync(path.join(temporary, 'package/package.json')));
        assert.deepEqual(packed, manifest);
        const convert = require(path.join(temporary, 'package')).default;
        assert.deepEqual(convert('<p><strong>Hello</strong> &amp; &lt;world&gt;</p>'), {
          text: '*Hello* &amp; &lt;world&gt;', image: '',
        });
        fs.writeFileSync(path.join(temporary, 'consumer.ts'),
          "import convert from './package';\nconst result: { text: string; image: string } = convert('<p>Hello</p>');\nconsole.log(result);\n");
        execFileSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'),
          '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2020', '--module', 'commonjs',
          path.join(temporary, 'consumer.ts')], { stdio: 'inherit' });
      } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
      }
      const outputs = { filename: pack.filename, version,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(''));
      }
      console.log(JSON.stringify(outputs));
      break;
    }
    default:
      throw new Error('Expected source, registry, or pack');
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
