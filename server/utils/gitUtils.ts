import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'

export interface SpawnResult {
  stdout: string
  stderr: string
  code: number | null
}

export function spawnAsync(command: string, args: string[], options: any = {}): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      shell: false,
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      resolve({ stdout, stderr, code })
    })
  })
}

export async function validateGitRepository(projectPath: string): Promise<void> {
  try {
    await access(projectPath)
  } catch {
    throw new Error(`Project path not found: ${projectPath}`)
  }

  try {
    const { stdout } = await spawnAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: projectPath })
    if (stdout.trim() !== 'true') {
      throw new Error('Not inside a git work tree')
    }
    await spawnAsync('git', ['rev-parse', '--show-toplevel'], { cwd: projectPath })
  } catch {
    throw new Error('Not a git repository. Initialize a git repository with "git init" to use source control features.')
  }
}

export async function getCurrentBranchName(projectPath: string): Promise<string> {
  try {
    const { stdout, code } = await spawnAsync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: projectPath })
    if (code === 0 && stdout.trim()) {
      return stdout.trim()
    }
  } catch (error) {
    // Ignore and fallback
  }

  const { stdout } = await spawnAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: projectPath })
  return stdout.trim()
}
