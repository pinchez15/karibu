import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  MasterDetail,
  STATION_COLLAPSE_BP,
  stationCollapseQuery,
} from './master-detail'

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === stationCollapseQuery() ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('MasterDetail', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders list and detail slots side-by-side at wide viewport', () => {
    mockMatchMedia(false)
    render(
      <MasterDetail
        list={<div data-testid="list-slot">List</div>}
        detail={<div data-testid="detail-slot">Detail body</div>}
        selectedId="visit-1"
      />,
    )
    expect(screen.getByTestId('list-slot')).toBeInTheDocument()
    expect(screen.getByText('Detail body')).toBeInTheDocument()
    expect(screen.getByRole('separator')).toBeInTheDocument()
  })

  it('shows empty detail copy when nothing selected', () => {
    mockMatchMedia(false)
    render(
      <MasterDetail
        list={<div>List</div>}
        detail={<div>Detail</div>}
        detailState="empty"
      />,
    )
    expect(screen.getByTestId('master-detail-empty')).toHaveTextContent(
      'Select a patient from the queue',
    )
  })

  it('shows loading skeleton without blank pane', () => {
    mockMatchMedia(false)
    const view = render(
      <MasterDetail
        list={<div data-testid="list-slot">List</div>}
        detail={<div>Detail</div>}
        selectedId="visit-1"
        detailState="loading"
      />,
    )
    expect(view.getByTestId('master-detail-loading')).toBeInTheDocument()
    expect(view.getByTestId('list-slot')).toBeInTheDocument()
  })

  it('shows error state with retry', () => {
    mockMatchMedia(false)
    const onRetry = vi.fn()
    render(
      <MasterDetail
        list={<div>List</div>}
        detail={<div>Detail</div>}
        selectedId="visit-1"
        detailState="error"
        onDetailRetry={onRetry}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(screen.getByTestId('master-detail-error')).toBeInTheDocument()
  })

  it('collapses to list-only layout below breakpoint', () => {
    mockMatchMedia(true)
    const view = render(
      <MasterDetail
        list={<div data-testid="list-slot">List</div>}
        detail={<div>Detail body</div>}
        selectedId="visit-1"
      />,
    )
    const root = view.getByTestId('list-slot').closest('[data-collapsed]')
    expect(root).toHaveAttribute('data-collapsed', 'true')
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
  })

  it('exports shared collapse breakpoint constant', () => {
    expect(STATION_COLLAPSE_BP).toBe(1024)
  })
})
