'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

type ContainerProps = {
  children: ReactNode
  className?: string
  narrow?: boolean
}

export function Container({ children, className = '', narrow }: ContainerProps) {
  return (
    <div
      className={`mx-auto w-full max-w-[1180px] px-8 ${narrow ? 'max-w-[980px]' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

type EyebrowProps = {
  children: ReactNode
  className?: string
  colorClassName?: string
}

export function Eyebrow({
  children,
  className = '',
  colorClassName = 'text-muted',
}: EyebrowProps) {
  return (
    <div
      className={`font-mono text-xs font-semibold uppercase tracking-[0.14em] ${colorClassName} ${className}`}
    >
      {children}
    </div>
  )
}

type BtnKind = 'primary' | 'ghost' | 'ghostDark' | 'soft' | 'link'

type BtnProps = {
  kind?: BtnKind
  children: ReactNode
  href?: string
  onClick?: () => void
  icon?: LucideIcon
  iconRight?: LucideIcon
  size?: 'sm' | 'md' | 'lg'
  accentClassName?: string
  className?: string
  type?: 'button' | 'submit'
}

export function Btn({
  kind = 'primary',
  children,
  href,
  onClick,
  icon: Icon,
  iconRight: IconRight,
  size = 'md',
  accentClassName = 'bg-cobalt',
  className = '',
  type = 'button',
}: BtnProps) {
  const pads = { sm: 'px-[15px] py-[9px] text-[13.5px]', md: 'px-5 py-3 text-[14.5px]', lg: 'px-[26px] py-[15px] text-base' }
  const iconSize = size === 'lg' ? 19 : 17

  const kinds: Record<BtnKind, string> = {
    primary: `${accentClassName} text-white border border-transparent shadow-[0_1px_2px_rgba(11,20,82,0.12),0_6px_16px_rgba(31,54,199,0.14)]`,
    ghost: 'bg-white text-ink border border-line',
    ghostDark: 'border border-white/20 bg-white/[0.08] text-white',
    soft: 'border border-cobalt/15 bg-cobalt/[0.08] text-cobalt',
    link: 'border-transparent bg-transparent p-0 shadow-none',
  }

  const base =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[11px] font-semibold leading-[1.1] transition-[transform,filter,box-shadow] duration-[130ms] hover:-translate-y-px hover:brightness-[0.97]'

  const classes = `${base} ${kind !== 'link' ? pads[size] : ''} ${kinds[kind]} ${className}`

  const content = (
    <>
      {Icon && <Icon size={iconSize} aria-hidden />}
      {children}
      {IconRight && <IconRight size={iconSize} aria-hidden />}
    </>
  )

  if (href) {
    const isInternal = href.startsWith('/') && !href.startsWith('//')
    if (isInternal) {
      return (
        <Link href={href} className={classes}>
          {content}
        </Link>
      )
    }
    return (
      <a href={href} className={classes}>
        {content}
      </a>
    )
  }

  return (
    <button type={type} onClick={onClick} className={classes}>
      {content}
    </button>
  )
}

type RevealProps = {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
  style?: CSSProperties
}

export function Reveal({ children, delay = 0, y = 18, className = '', style }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    const rect = el.getBoundingClientRect()
    const below = rect.top > (window.innerHeight || 800) * 0.92
    if (!below) return

    setSeen(false)
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
    )
    io.observe(el)
    const t = setTimeout(() => {
      setSeen(true)
      io.disconnect()
    }, 1600)

    return () => {
      io.disconnect()
      clearTimeout(t)
    }
  }, [])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: seen ? 1 : 0,
        transform: seen ? 'none' : `translateY(${y}px)`,
        transition: `opacity 680ms cubic-bezier(.16,.84,.44,1) ${delay}ms, transform 680ms cubic-bezier(.16,.84,.44,1) ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
