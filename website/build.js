/**
 * Simple build script for the Better Vibe landing page
 * Copies files to dist/ and optionally minifies them
 */

import { readdir, mkdir, copyFile, readFile, writeFile } from 'fs/promises';
import { join, extname } from 'path';

const DIST_DIR = './dist';
const SOURCE_FILES = ['index.html', 'robots.txt', 'sitemap.xml'];
const SOURCE_DIRS = ['styles', 'scripts', 'assets'];

async function ensureDir(dir) {
  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

async function copyDir(src, dest) {
  await ensureDir(dest);

  try {
    const entries = await readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else {
        await copyFile(srcPath, destPath);
        console.log(`  Copied: ${srcPath} -> ${destPath}`);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

async function minifyCSS(content) {
  // Basic CSS minification
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/\s*([{}:;,])\s*/g, '$1') // Remove spaces around special chars
    .replace(/;}/g, '}') // Remove trailing semicolons
    .trim();
}

async function minifyJS(content) {
  // Basic JS minification (preserves functionality, removes obvious whitespace)
  // For production, use a proper minifier like terser
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
    .replace(/\/\/.*$/gm, '') // Remove line comments
    .replace(/^\s+/gm, '') // Remove leading whitespace
    .replace(/\n+/g, '\n') // Collapse multiple newlines
    .trim();
}

async function build() {
  console.log('\nBuilding Better Vibe Website...\n');

  // Clean and create dist directory
  await ensureDir(DIST_DIR);

  // Copy root files
  for (const file of SOURCE_FILES) {
    try {
      await copyFile(`./${file}`, `${DIST_DIR}/${file}`);
      console.log(`  Copied: ${file}`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`  Warning: Could not copy ${file}`);
      }
    }
  }

  // Copy and process directories
  for (const dir of SOURCE_DIRS) {
    await copyDir(`./${dir}`, `${DIST_DIR}/${dir}`);
  }

  // Optionally minify files in production
  if (process.env.NODE_ENV === 'production') {
    console.log('\n  Minifying files...');

    // Minify CSS
    try {
      const cssPath = `${DIST_DIR}/styles/main.css`;
      const css = await readFile(cssPath, 'utf-8');
      await writeFile(cssPath, await minifyCSS(css));
      console.log(`  Minified: styles/main.css`);
    } catch (err) {
      console.warn(`  Warning: Could not minify CSS`);
    }

    // Minify JS
    try {
      const jsPath = `${DIST_DIR}/scripts/main.js`;
      const js = await readFile(jsPath, 'utf-8');
      await writeFile(jsPath, await minifyJS(js));
      console.log(`  Minified: scripts/main.js`);
    } catch (err) {
      console.warn(`  Warning: Could not minify JS`);
    }
  }

  console.log('\n  Build complete! Output: ./dist\n');
}

build().catch(console.error);
