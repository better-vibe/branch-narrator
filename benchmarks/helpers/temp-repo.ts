/**
 * Helper module for creating temporary git repositories for benchmarks.
 * Generates deterministic repos with committed, staged, and unstaged changes.
 */

import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execa } from 'execa';
import type { BenchmarkSize } from '../types.js';

/**
 * Configuration for a specific benchmark size.
 * Defines the number of files and settings for generated test repositories.
 */
interface SizeConfig {
  committedFiles: number;
  stagedFiles: number;
  unstagedFiles: number;
  linesPerFile: number;
  includeRenames: boolean;
}

const SIZE_CONFIGS: Record<BenchmarkSize, SizeConfig> = {
  small: {
    committedFiles: 5,
    stagedFiles: 2,
    unstagedFiles: 2,
    linesPerFile: 50,
    includeRenames: false,
  },
  medium: {
    committedFiles: 20,
    stagedFiles: 5,
    unstagedFiles: 5,
    linesPerFile: 100,
    includeRenames: true,
  },
  large: {
    committedFiles: 50,
    stagedFiles: 10,
    unstagedFiles: 10,
    linesPerFile: 200,
    includeRenames: true,
  },
};

export interface BenchmarkRepo {
  /** Working directory of the temp repository */
  cwd: string;
  /** Base branch name (e.g., 'develop') */
  baseBranch: string;
  /** Feature branch name (e.g., 'feature/benchmark') */
  featureBranch: string;
  /** Cleanup function to remove the temp directory */
  cleanup: () => Promise<void>;
}

/**
 * Generate file content with specified number of lines.
 */
function generateFileContent(fileName: string, lines: number): string {
  const content: string[] = [];
  content.push(`// ${fileName}`);
  content.push('');
  
  if (fileName.endsWith('.ts') || fileName.endsWith('.js')) {
    content.push('export class BenchmarkClass {');
    for (let i = 0; i < lines - 5; i++) {
      content.push(`  // Line ${i + 1}: This is a generated line for benchmarking purposes`);
    }
    content.push('}');
  } else if (fileName.endsWith('.md')) {
    content.push('# Benchmark File');
    content.push('');
    for (let i = 0; i < lines - 3; i++) {
      content.push(`This is line ${i + 1} of generated markdown content for benchmarking.`);
    }
  } else {
    for (let i = 0; i < lines; i++) {
      content.push(`Line ${i + 1}: Generated content for benchmarking`);
    }
  }
  
  return content.join('\n');
}

/**
 * Execute a git command in the specified directory.
 */
async function git(args: string[], cwd: string): Promise<void> {
  await execa('git', args, { cwd });
}

/**
 * Create a temporary git repository with deterministic changes.
 */
export async function setupBenchmarkRepo(size: BenchmarkSize = 'medium'): Promise<BenchmarkRepo> {
  const config = SIZE_CONFIGS[size];
  
  // Create temp directory
  const cwd = await mkdtemp(join(tmpdir(), 'benchmark-repo-'));
  
  try {
    // Initialize git repo
    await git(['init', '-b', 'develop'], cwd);
    await git(['config', 'user.name', 'Benchmark Bot'], cwd);
    await git(['config', 'user.email', 'benchmark@example.com'], cwd);
    
    // Create base branch with initial commit
    await writeFile(join(cwd, 'README.md'), '# Benchmark Repository\n\nInitial commit.\n');
    await writeFile(join(cwd, 'package.json'), JSON.stringify({
      name: 'benchmark-repo',
      version: '1.0.0',
      description: 'Temporary repository for benchmarking',
    }, null, 2));
    await git(['add', '.'], cwd);
    await git(['commit', '-m', 'Initial commit'], cwd);
    
    // Create feature branch
    await git(['checkout', '-b', 'feature/benchmark'], cwd);
    
    // Add committed changes (multiple file types)
    const fileTypes = [
      { ext: '.ts', dir: 'src' },
      { ext: '.js', dir: 'lib' },
      { ext: '.md', dir: 'docs' },
      { ext: '.json', dir: 'config' },
    ];
    
    for (let i = 0; i < config.committedFiles; i++) {
      const fileType = fileTypes[i % fileTypes.length];
      const dirPath = join(cwd, fileType.dir);
      await mkdir(dirPath, { recursive: true });
      
      const fileName = `file-${i}${fileType.ext}`;
      const filePath = join(dirPath, fileName);
      const content = generateFileContent(fileName, config.linesPerFile);
      
      await writeFile(filePath, content);
    }
    
    await git(['add', '.'], cwd);
    await git(['commit', '-m', `Add ${config.committedFiles} files for benchmark`], cwd);
    
    // Add more commits for realistic history
    if (config.committedFiles > 10) {
      // Modify some existing files
      const updateCount = Math.min(5, Math.floor(config.committedFiles / 4));
      for (let i = 0; i < updateCount; i++) {
        const fileType = fileTypes[i % fileTypes.length];
        const fileName = `file-${i}${fileType.ext}`;
        const filePath = join(cwd, fileType.dir, fileName);
        const content = generateFileContent(fileName, config.linesPerFile + 10);
        await writeFile(filePath, content);
      }
      await git(['add', '.'], cwd);
      await git(['commit', '-m', 'Update files'], cwd);
    }
    
    // Add file renames if configured
    if (config.includeRenames) {
      const srcFile = join(cwd, 'src', 'file-0.ts');
      const destFile = join(cwd, 'src', 'renamed-file.ts');
      await git(['mv', srcFile, destFile], cwd);
      await git(['commit', '-m', 'Rename file for benchmark'], cwd);
    }
    
    // Add staged changes (in index, not committed)
    for (let i = 0; i < config.stagedFiles; i++) {
      const fileType = fileTypes[i % fileTypes.length];
      const dirPath = join(cwd, fileType.dir);
      await mkdir(dirPath, { recursive: true });
      
      const fileName = `staged-${i}${fileType.ext}`;
      const filePath = join(dirPath, fileName);
      const content = generateFileContent(fileName, config.linesPerFile);
      
      await writeFile(filePath, content);
      await git(['add', filePath], cwd);
    }
    
    // Add unstaged changes (working tree only)
    for (let i = 0; i < config.unstagedFiles; i++) {
      const fileType = fileTypes[i % fileTypes.length];
      const dirPath = join(cwd, fileType.dir);
      await mkdir(dirPath, { recursive: true });
      
      const fileName = `unstaged-${i}${fileType.ext}`;
      const filePath = join(dirPath, fileName);
      const content = generateFileContent(fileName, config.linesPerFile);
      
      await writeFile(filePath, content);
      // Don't add to git - leave as unstaged
    }
    
    // Also modify some existing committed files without staging
    if (config.unstagedFiles > 0) {
      const modifyPath = join(cwd, 'README.md');
      const modifiedContent = '# Benchmark Repository\n\nInitial commit.\n\nUnstaged modification.\n';
      await writeFile(modifyPath, modifiedContent);
    }
    
    return {
      cwd,
      baseBranch: 'develop',
      featureBranch: 'feature/benchmark',
      cleanup: async () => {
        try {
          await rm(cwd, { recursive: true, force: true });
        } catch (error) {
          // Ignore cleanup errors - directory may already be deleted
          // or inaccessible, which is acceptable for temp directories
        }
      },
    };
  } catch (error) {
    // Cleanup on error and rethrow
    try {
      await rm(cwd, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors - the original error is more important
    }
    throw error;
  }
}

/**
 * Cleanup a benchmark repository.
 * Provides consistent API and error handling for repository cleanup.
 */
export async function cleanupBenchmarkRepo(repo: BenchmarkRepo): Promise<void> {
  try {
    await repo.cleanup();
  } catch (error) {
    // Log but don't throw - cleanup failures for temp directories
    // are not critical and shouldn't fail the benchmark run
    console.warn('Warning: Failed to cleanup benchmark repository:', error);
  }
}
