import { WebTopBar } from '@/components/web-shell'

interface WorkspaceTopBarProps {
  title: string
  roleLabel: string
  awaiting: number
  oldestWaitLabel?: string | null
  actions?: React.ReactNode
}

/**
 * Station workspace header — queue count + oldest-wait anchor in the subtitle line.
 */
export function WorkspaceTopBar({
  title,
  roleLabel,
  awaiting,
  oldestWaitLabel,
  actions,
}: WorkspaceTopBarProps) {
  const subtitleParts = [
    roleLabel,
    `${awaiting} ${awaiting === 1 ? 'awaiting' : 'awaiting'}`,
    oldestWaitLabel ? `oldest ${oldestWaitLabel}` : null,
  ].filter(Boolean)

  return (
    <WebTopBar
      title={title}
      subtitle={subtitleParts.join(' · ')}
      actions={actions}
    />
  )
}
