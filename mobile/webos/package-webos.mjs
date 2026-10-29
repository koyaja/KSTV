#!/usr/bin/env node
/**
 * Builds the LG webOS package (.ipk) from the Angular production build.
 *
 *   pnpm nx build web --configuration=production   (repo root)
 *   cd mobile && npm run webos:package
 *
 * Output: mobile/webos/dist/com.koyaja.kstv_<version>_all.ipk
 * Install on a TV in Developer Mode:
 *   ares-setup-device   (once)
 *   ares-install --device <tv> mobile/webos/dist/*.ipk
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webBuild = resolve(here, '../../dist/apps/web');
const stage = join(here, 'build', 'app');
const output = join(here, 'dist');

if (!existsSync(join(webBuild, 'index.html'))) {
    console.error(`No web build at ${webBuild}. Run: pnpm nx build web --configuration=production`);
    process.exit(1);
}

rmSync(join(here, 'build'), { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
mkdirSync(output, { recursive: true });

cpSync(webBuild, stage, { recursive: true });
// A packaged webOS app is served from file://: no service worker.
for (const file of ['ngsw-worker.js', 'ngsw.json', 'safety-worker.js', 'worker-basic.min.js']) {
    rmSync(join(stage, file), { force: true });
}

const appInfo = JSON.parse(readFileSync(join(here, 'appinfo.json'), 'utf8'));
const mobileVersion = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8')).version;
appInfo.version = mobileVersion;
writeFileSync(join(stage, 'appinfo.json'), `${JSON.stringify(appInfo, null, 4)}\n`);

for (const asset of ['icon.png', 'largeIcon.png', 'splash.png']) {
    if (!existsSync(join(here, asset))) {
        console.error(`Missing ${asset}. Run: python3 mobile/branding/generate_icons.py`);
        process.exit(1);
    }
    cpSync(join(here, asset), join(stage, asset));
}

const require = createRequire(import.meta.url);
const aresPackage = require.resolve('@webos-tools/cli/bin/ares-package.js');
execFileSync(process.execPath, [aresPackage, '--no-minify', '--outdir', output, stage], {
    stdio: 'inherit',
});
console.log(`webOS package written to ${output}`);
