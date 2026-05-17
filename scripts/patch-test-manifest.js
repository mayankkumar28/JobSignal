// scripts/patch-test-manifest.js
// Copies dist/ → dist-test/ and patches manifest to allow localhost content scripts

const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '../dist');
const testDistDir = path.resolve(__dirname, '../dist-test');

if (fs.existsSync(testDistDir)) fs.rmSync(testDistDir, { recursive: true });
fs.cpSync(distDir, testDistDir, { recursive: true });

const manifest = JSON.parse(fs.readFileSync(path.join(testDistDir, 'manifest.json'), 'utf8'));
const overrides = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/manifest-test-overrides.json'), 'utf8')
);

if (overrides.content_scripts) manifest.content_scripts = overrides.content_scripts;

fs.writeFileSync(path.join(testDistDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('✓ Patched dist-test/manifest.json');
