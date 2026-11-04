import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLocalOffice } from '@karibu/shared'
import { LocalOfficePage } from './LocalOfficePage'

vi.mock('next/image', () => ({
  default: (props: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} src={props.src} />
  ),
}))

afterEach(() => cleanup())

describe('LocalOfficePage (Uganda)', () => {
  const office = getLocalOffice('uganda')

  it('is registered as the Uganda local office', () => {
    expect(office).toBeDefined()
    expect(office?.slug).toBe('uganda')
    expect(office?.name).toBe('Karibu Health')
    expect(office?.territory).toBe('Uganda')
    expect(office?.lead.title).toBe('Marketing Personnel and Co-designer of Karibu')
  })

  it('renders Uganda-wide messaging without Masaka references', () => {
    render(<LocalOfficePage office={office!} />)

    expect(screen.getAllByText('Karibu Health').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('heading', {
        name: /Clinic software for healthcare facilities across Uganda/i,
      }),
    ).toBeTruthy()
    expect(screen.getByText(/Karibu serves healthcare facilities across Uganda/i)).toBeTruthy()
    expect(screen.getByText('Marketing Personnel and Co-designer of Karibu')).toBeTruthy()
    expect(
      screen.getByRole('heading', {
        name: /Javis Bbombokka is your implementation and support contact/i,
      }),
    ).toBeTruthy()
    expect(screen.getByText(/implementation and support contact for Karibu in Uganda/i)).toBeTruthy()

    const html = document.body.textContent ?? ''
    expect(html).not.toMatch(/Masaka/i)
    expect(html).not.toMatch(/Karibu Masaka/i)
    expect(html).not.toMatch(/Javis is a nurse/i)
  })
})
