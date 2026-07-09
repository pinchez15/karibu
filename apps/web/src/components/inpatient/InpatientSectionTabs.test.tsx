import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, expect, it, afterEach } from 'vitest'
import { InpatientSectionTabs } from './InpatientSectionTabs'

describe('InpatientSectionTabs', () => {
  afterEach(() => cleanup())

  it('shows the census tab by default and hides the discharged tab', () => {
    render(
      <InpatientSectionTabs
        active={<div>Census content</div>}
        discharged={<div>Discharged content</div>}
        dischargedCount={3}
      />,
    )

    expect(screen.getByText('Census content').parentElement).not.toHaveClass('hidden')
    expect(screen.getByText('Discharged content').parentElement).toHaveClass('hidden')
  })

  it('switches to the discharged tab on click and shows the count badge', () => {
    render(
      <InpatientSectionTabs
        active={<div>Census content</div>}
        discharged={<div>Discharged content</div>}
        dischargedCount={5}
      />,
    )

    expect(screen.getByText('5')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Discharged/ }))

    expect(screen.getByText('Discharged content').parentElement).not.toHaveClass('hidden')
    expect(screen.getByText('Census content').parentElement).toHaveClass('hidden')
  })

  it('omits the badge when there are no discharges', () => {
    render(
      <InpatientSectionTabs
        active={<div>Census content</div>}
        discharged={<div>Discharged content</div>}
        dischargedCount={0}
      />,
    )
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
