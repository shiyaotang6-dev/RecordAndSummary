const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const workspaceRoot = path.resolve(__dirname, '../../..');
const outputDir = path.join(workspaceRoot, 'outputs');
const projectDir = path.resolve(__dirname, '..');
const sourcePath = path.join(outputDir, 'shiri-logo.svg');
const iconSizes = [16, 24, 32, 48, 64, 128, 256, 1024];

function toIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  let offset = header.length + frames.length * 16;
  const directory = frames.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...directory, ...frames.map(({ data }) => data)]);
}

async function buildIcons() {
  const svgBase64 = fs.readFileSync(sourcePath).toString('base64');
  const window = new BrowserWindow({
    show: false,
    width: 1024,
    height: 1024,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });

  try {
    await window.loadURL('data:text/html,<html><body></body></html>');
    const frames = await window.webContents.executeJavaScript(`(async () => {
      const image = new Image();
      image.src = 'data:image/svg+xml;base64,${svgBase64}';
      await image.decode();
      return ${JSON.stringify(iconSizes)}.map((size) => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, size, size);
        context.drawImage(image, 0, 0, size, size);
        return { size, data: canvas.toDataURL('image/png').slice('data:image/png;base64,'.length) };
      });
    })()`);

    const pngFrames = frames.map(({ size, data }) => ({
      size,
      data: Buffer.from(data, 'base64')
    }));
    fs.writeFileSync(path.join(outputDir, 'shiri-logo.png'), pngFrames.at(-1).data);
    const ico = toIco(pngFrames.filter(({ size }) => size <= 256));
    fs.writeFileSync(path.join(outputDir, 'shiri-logo.ico'), ico);

    const buildDir = path.join(projectDir, 'build');
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
  } finally {
    window.destroy();
  }
}

app.whenReady().then(async () => {
  try {
    await buildIcons();
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
