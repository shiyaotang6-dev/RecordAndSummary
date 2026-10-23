const fs = require('node:fs');
const path = require('node:path');

const workspaceRoot = path.resolve(__dirname, '../../..');
const outputDir = path.join(workspaceRoot, 'outputs');
const appDir = path.resolve(__dirname, '../app');
const assets = ['shiri-journal.html', 'deep-green-flow.png', 'shiri-logo.png'];

fs.mkdirSync(appDir, { recursive: true });
for (const asset of assets) {
  const source = path.join(outputDir, asset);
  if (!fs.existsSync(source)) throw new Error(`Required app asset is missing: ${source}`);
  fs.copyFileSync(source, path.join(appDir, asset));
}
