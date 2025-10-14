const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

const staticFiles = [
  'index.html',
  'app.js',
  'button-types.json',
  'toddler-content.json'
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(relativePath, destinationRoot) {
  const srcPath = path.join(projectRoot, relativePath);
  const destPath = path.join(destinationRoot, relativePath);

  if (!fs.existsSync(srcPath)) {
    console.warn(`Skipping missing file: ${relativePath}`);
    return;
  }

  ensureDir(path.dirname(destPath));
  fs.copyFileSync(srcPath, destPath);
}

function copyDirectory(relativePath, destinationRoot) {
  const srcDir = path.join(projectRoot, relativePath);
  const destDir = path.join(destinationRoot, relativePath);

  if (!fs.existsSync(srcDir)) {
    return;
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  ensureDir(destDir);

  for (const entry of entries) {
    const entryRelPath = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(entryRelPath, destinationRoot);
    } else {
      copyFile(entryRelPath, destinationRoot);
    }
  }
}

function cleanDist() {
  fs.rmSync(distDir, { recursive: true, force: true });
  ensureDir(distDir);
}

function buildTailwind() {
  const input = path.join(projectRoot, 'styles', 'tailwind.css');
  const output = path.join(distDir, 'tailwind.css');
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  if (!fs.existsSync(input)) {
    console.warn('Skipping Tailwind build: input file not found.');
    return;
  }

  const result = spawnSync(npx, ['tailwindcss', '-i', input, '-o', output, '--minify'], {
    cwd: projectRoot,
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error('Tailwind build failed');
  }
}

function build() {
  cleanDist();
  buildTailwind();
  staticFiles.forEach(file => copyFile(file, distDir));
  copyDirectory('public', distDir);
  console.log(`Build complete. Assets copied to ${distDir}`);
}

build();
