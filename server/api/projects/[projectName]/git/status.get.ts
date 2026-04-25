import { validateGitRepository, getCurrentBranchName, spawnAsync } from '../../../../utils/gitUtils'

export default defineEventHandler(async (event) => {
  const projectName = getRouterParam(event, 'projectName', { decode: true })
  if (!projectName) {
    throw createError({ statusCode: 400, message: 'Project name is required' })
  }

  let projectPath: string
  try {
    const res = await $fetch<{ projectName: string | null }>(`/api/projects/resolve?name=${encodeURIComponent(projectName)}`)
    if (!res.projectName) {
      projectPath = projectName.replace(/-/g, '/')
    } else {
      const projects = await $fetch<any[]>('/api/projects')
      const project = projects.find(p => p.name === res.projectName)
      if (!project) throw new Error('Project not found')
      projectPath = project.path
    }
  } catch (e) {
    projectPath = projectName.replace(/-/g, '/')
  }

  try {
    await validateGitRepository(projectPath)
    const branch = await getCurrentBranchName(projectPath)
    
    const { stdout: statusOutput } = await spawnAsync('git', ['status', '--porcelain'], { cwd: projectPath })
    
    const modified: string[] = []
    const added: string[] = []
    const deleted: string[] = []
    const untracked: string[] = []
    const staged: string[] = []

    const lines = statusOutput.split('\n').filter(Boolean)
    for (const line of lines) {
      const status = line.slice(0, 2)
      const file = line.slice(3).replace(/^"|"$/g, '')

      if (status[0] !== ' ' && status[0] !== '?') {
        staged.push(file)
      }

      if (status === '??') untracked.push(file)
      else if (status[1] === 'M') modified.push(file)
      else if (status[1] === 'A') added.push(file)
      else if (status[1] === 'D') deleted.push(file)
    }

    return {
      branch,
      modified,
      added,
      deleted,
      untracked,
      staged,
      projectPath
    }
  } catch (error: any) {
    return {
      error: error.message,
      projectPath
    }
  }
})
