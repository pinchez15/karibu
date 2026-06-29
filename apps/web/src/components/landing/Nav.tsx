'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { KLockup } from './brand'
import { BOOK_DEMO_MAILTO, SIGN_IN_HREF } from './constants'
import { Btn, Container } from './ui'

const LINKS: [string, string][] = [
  ['Platform', '#platform'],
  ['Karibu EHR', '#ehr'],
  ['Karibu Learn', '#learn'],
  ['Impact', '#impact'],
]

export function Nav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 transition-[background,border-color] duration-240 ${
        scrolled
          ? 'border-b border-line bg-page/80 backdrop-blur-[14px] backdrop-saturate-[180%]'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <Container className="flex h-[70px] items-center justify-between">
        <a href="#top" className="no-underline">
          <KLockup size={30} textColor="rgb(var(--kh-ink))" />
        </a>

        <nav className="hidden items-center gap-[30px] min-[921px]:flex">
          {LINKS.map(([label, href]) => (
            <a
              key={label}
              href={href}
              className="text-sm font-medium text-body no-underline transition-colors hover:text-ink"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href={SIGN_IN_HREF}
            className="hidden text-sm font-semibold text-ink no-underline min-[921px]:inline"
          >
            Sign in
          </Link>
          <Btn kind="primary" size="sm" href={BOOK_DEMO_MAILTO}>
            Book a demo
          </Btn>
        </div>
      </Container>
    </header>
  )
}
