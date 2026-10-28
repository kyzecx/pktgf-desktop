import * as React from 'react'

type IconProps = { className?: string }

const base = (className?: string): string => className ?? 'size-5'

export function IconHome({ className }: IconProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      className={base(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M3.5 8.5 10 3l6.5 5.5V16a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" strokeLinejoin="round" />
      <path d="M8 17v-4.5h4V17" />
    </svg>
  )
}

export function IconShirt({ className }: IconProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      className={base(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        d="M7 3 3.5 5.5 5 8.5l1.5-.7V16a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V7.8l1.5.7 1.5-3L13 3l-1.5 1.5h-3z"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconHouse({ className }: IconProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      className={base(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M2.5 9 10 2.5 17.5 9" strokeLinecap="round" />
      <path d="M4.5 8v8.5h11V8" strokeLinejoin="round" />
      <path d="M8 16.5v-4h4v4" />
    </svg>
  )
}

export function IconSofa({ className }: IconProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      className={base(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M3 10V7.5A1.5 1.5 0 0 1 4.5 6h11A1.5 1.5 0 0 1 17 7.5V10" />
      <path
        d="M2.5 10.5a1.5 1.5 0 0 1 3 0V12h9v-1.5a1.5 1.5 0 0 1 3 0V15a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconPaw({ className }: IconProps): React.ReactElement {
  return (
    <svg viewBox="0 0 20 20" className={base(className)} fill="currentColor">
      <ellipse cx="6" cy="7" rx="1.7" ry="2.2" />
      <ellipse cx="10" cy="5.6" rx="1.7" ry="2.3" />
      <ellipse cx="14" cy="7" rx="1.7" ry="2.2" />
      <path d="M10 9.4c2.4 0 4.4 1.9 4.4 4.1 0 1.7-1.4 2.6-2.9 2.6-.9 0-1.1-.5-1.5-.5s-.6.5-1.5.5c-1.5 0-2.9-.9-2.9-2.6 0-2.2 2-4.1 4.4-4.1z" />
    </svg>
  )
}

export function IconSettings({ className }: IconProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      className={base(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M3 6h14M3 14h14" strokeLinecap="round" />
      <circle cx="7.5" cy="6" r="2" fill="var(--pkt-bg-elev)" />
      <circle cx="12.5" cy="14" r="2" fill="var(--pkt-bg-elev)" />
    </svg>
  )
}

export function IconRefresh({ className }: IconProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      className={base(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M16 8a6 6 0 1 0 .2 3.2" strokeLinecap="round" />
      <path d="M16 3.5V8h-4.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconFolder({ className }: IconProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      className={base(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        d="M2.8 6.2A1.2 1.2 0 0 1 4 5h3.4l1.4 1.6H16a1.2 1.2 0 0 1 1.2 1.2v6.4A1.2 1.2 0 0 1 16 15.4H4a1.2 1.2 0 0 1-1.2-1.2z"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconArrowRight({ className }: IconProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      className={base(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="M4 10h11M11 5.5 15.5 10 11 14.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** 分类横排：顶部一排小方块 */
export function IconLayoutHorizontal({ className }: IconProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      className={base(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <rect x="2.5" y="4" width="4" height="12" rx="1" />
      <rect x="8" y="4" width="4" height="12" rx="1" />
      <rect x="13.5" y="4" width="4" height="12" rx="1" />
    </svg>
  )
}

/** 分类竖排：左侧一列小方块 */
export function IconLayoutVertical({ className }: IconProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      className={base(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <rect x="4" y="2.5" width="12" height="4" rx="1" />
      <rect x="4" y="8" width="12" height="4" rx="1" />
      <rect x="4" y="13.5" width="12" height="4" rx="1" />
    </svg>
  )
}

/** 衣柜：衣架 */
export function IconHanger({ className }: IconProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      className={base(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M10 8a2 2 0 1 1 2-2" strokeLinecap="round" />
      <path d="M10 8v2.4" strokeLinecap="round" />
      <path
        d="M10 10.4 3.1 14.6a1.1 1.1 0 0 0 .6 2h12.6a1.1 1.1 0 0 0 .6-2z"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 表情 */
export function IconFace({ className }: IconProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      className={base(className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="10" cy="10" r="7" />
      <circle cx="7.6" cy="8.4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12.4" cy="8.4" r="0.9" fill="currentColor" stroke="none" />
      <path d="M6.8 12c.7 1.2 1.8 1.9 3.2 1.9s2.5-.7 3.2-1.9" strokeLinecap="round" />
    </svg>
  )
}
