import type { OutputStyle } from '~/types'

export const DEFAULT_OUTPUT_STYLES: OutputStyle[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Claude Code’s standard output style, designed for efficient software engineering tasks.',
    content: 'Default output style. (Handled by Claude Code natively)',
    keepCodingInstructions: true,
    scope: 'global' as const,
    path: ''
  },
  {
    id: 'explanatory',
    name: 'Explanatory',
    description: 'Provides educational “Insights” to help you understand implementation choices and codebase patterns.',
    content: 'Provide educational "Insights" in between helping me complete software engineering tasks. Help me understand implementation choices and codebase patterns throughout our conversation.',
    keepCodingInstructions: true,
    scope: 'global' as const,
    path: ''
  },
  {
    id: 'learning',
    name: 'Learning',
    description: 'Collaborative, learn-by-doing mode. Claude will share “Insights” and ask you to contribute code yourself using TODO(human) markers.',
    content: 'Operate in a collaborative, learn-by-doing mode. Share "Insights" while coding, and also ask me to contribute small, strategic pieces of code myself. Add TODO(human) markers in the code for me to implement instead of doing it all yourself.',
    keepCodingInstructions: true,
    scope: 'global' as const,
    path: ''
  }
]
