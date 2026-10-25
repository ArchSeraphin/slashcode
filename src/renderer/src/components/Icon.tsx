import { Children, cloneElement, isValidElement, useId, type JSX, type ReactNode } from 'react'

export type IconName =
  | 'folder'
  | 'folderOpen'
  | 'computer'
  | 'console'
  | 'notepad'
  | 'tasks'
  | 'star'
  | 'starEmpty'
  | 'gear'
  | 'search'
  | 'plus'
  | 'play'
  | 'history'
  | 'warning'
  | 'check'
  | 'info'
  | 'power'
  | 'help'
  | 'archive'
  | 'finder'
  | 'code'
  | 'refresh'
  | 'close'
  | 'hourglass'
  | 'pause'
  | 'send'
  | 'trash'
  | 'import'
  | 'run'
  | 'bell'
  | 'logo'
  | 'up'
  | 'mic'
  | 'layout1'
  | 'layout2'
  | 'layout3'
  | 'layout4'
  | 'fail'
  | 'neutral'
  | 'pr'
  | 'external'

// Every icon is drawn on a 32×32 grid with the soft gradients and dark outlines of the Luna era.
const D: Record<IconName, JSX.Element> = {
  folder: (
    <>
      <defs>
        <linearGradient id="fo-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9a6" />
          <stop offset="1" stopColor="#f2c14e" />
        </linearGradient>
        <linearGradient id="fo-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3c9" />
          <stop offset="1" stopColor="#f6c94f" />
        </linearGradient>
      </defs>
      <path d="M2 8.5c0-1 .8-1.8 1.8-1.8h7.4l2.6 2.6h14.4c1 0 1.8.8 1.8 1.8v14.6c0 1-.8 1.8-1.8 1.8H3.8c-1 0-1.8-.8-1.8-1.8z" fill="url(#fo-a)" stroke="#b98a1c" />
      <path d="M2.6 13.2h26.8v12.5c0 .7-.6 1.3-1.3 1.3H3.9c-.7 0-1.3-.6-1.3-1.3z" fill="url(#fo-b)" stroke="#c99a25" />
      <path d="M4 14.6h24" stroke="#fffbe8" strokeWidth="1.2" />
    </>
  ),
  folderOpen: (
    <>
      <defs>
        <linearGradient id="fop-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffeeb0" />
          <stop offset="1" stopColor="#e9b53c" />
        </linearGradient>
      </defs>
      <path d="M2 8.5c0-1 .8-1.8 1.8-1.8h7.4l2.6 2.6h13c1 0 1.8.8 1.8 1.8v3H2z" fill="#e8b440" stroke="#b98a1c" />
      <path d="M5.5 14h24.8l-3.6 12.2c-.2.6-.7.9-1.3.9H3.4c-.8 0-1.3-.7-1.1-1.4z" fill="url(#fop-a)" stroke="#b98a1c" />
    </>
  ),
  computer: (
    <>
      <defs>
        <linearGradient id="co-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5fa8ff" />
          <stop offset="1" stopColor="#0c4fd0" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="26" height="19" rx="2" fill="#d9dde6" stroke="#5a6170" />
      <rect x="5.5" y="5.5" width="21" height="14" fill="url(#co-a)" stroke="#2a3c6b" />
      <path d="M6.5 15c4-4 8-6 19-8" stroke="#9fd0ff" strokeWidth="1.4" fill="none" opacity=".7" />
      <path d="M12 22h8l1.5 4h-11z" fill="#b8bec9" stroke="#5a6170" />
      <rect x="7" y="26" width="18" height="3" rx="1" fill="#d9dde6" stroke="#5a6170" />
    </>
  ),
  console: (
    <>
      <rect x="2.5" y="4.5" width="27" height="23" rx="2" fill="#0d0d0d" stroke="#45505f" />
      <rect x="2.5" y="4.5" width="27" height="5" rx="2" fill="#2f6be6" />
      <path d="M6 14l4 3-4 3" stroke="#d6d6d6" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M12 21h8" stroke="#d6d6d6" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  notepad: (
    <>
      <rect x="6" y="3" width="20" height="26" rx="1.5" fill="#fff" stroke="#6c7b95" />
      <rect x="6" y="3" width="20" height="5" fill="#77a3f0" stroke="#3c63b8" />
      {[12, 16, 20, 24].map((y) => (
        <path key={y} d={`M9 ${y}h14`} stroke="#9aa8c4" />
      ))}
    </>
  ),
  tasks: (
    <>
      <rect x="5" y="3" width="22" height="26" rx="1.5" fill="#fffef4" stroke="#7a6f4c" />
      <rect x="11" y="1.5" width="10" height="4" rx="1" fill="#c9ccd4" stroke="#5f6675" />
      <path d="M8.5 11.5l2 2 3.5-4M8.5 18.5l2 2 3.5-4" stroke="#26a32b" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M16 12h8M16 19h8M9 25h15" stroke="#8a8f9c" strokeWidth="1.4" />
    </>
  ),
  star: (
    <path
      d="M16 3l3.9 8 8.6 1.2-6.3 6 1.6 8.6L16 22.6l-7.8 4.2 1.6-8.6-6.3-6L12.1 11z"
      fill="#ffd23b"
      stroke="#c98a07"
      strokeLinejoin="round"
    />
  ),
  starEmpty: (
    <path
      d="M16 3l3.9 8 8.6 1.2-6.3 6 1.6 8.6L16 22.6l-7.8 4.2 1.6-8.6-6.3-6L12.1 11z"
      fill="none"
      stroke="#8a93a6"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  ),
  gear: (
    <>
      <path
        d="M14 3h4l.7 3.4 2.6 1.1 2.9-1.9 2.8 2.8-1.9 2.9 1.1 2.6L29 14v4l-3.4.7-1.1 2.6 1.9 2.9-2.8 2.8-2.9-1.9-2.6 1.1L18 29h-4l-.7-3.4-2.6-1.1-2.9 1.9L5 23.6l1.9-2.9-1.1-2.6L3 18v-4l3.4-.7 1.1-2.6L5.6 7.8l2.8-2.8 2.9 1.9 2.6-1.1z"
        fill="#c9d3e3"
        stroke="#4f5b70"
      />
      <circle cx="16" cy="16" r="4.5" fill="#f2f4f8" stroke="#4f5b70" />
    </>
  ),
  search: (
    <>
      <circle cx="13" cy="13" r="8" fill="#d8ecff" stroke="#3a5c8f" strokeWidth="2" />
      <path d="M10 10a4 4 0 0 1 5-1" stroke="#fff" strokeWidth="1.6" fill="none" />
      <path d="M19 19l8 8" stroke="#7a5a2b" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  plus: (
    <>
      <circle cx="16" cy="16" r="12.5" fill="#3cb043" stroke="#1d6d22" />
      <path d="M16 9v14M9 16h14" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
    </>
  ),
  play: (
    <>
      <circle cx="16" cy="16" r="12.5" fill="#3cb043" stroke="#1d6d22" />
      <path d="M13 10l9 6-9 6z" fill="#fff" />
    </>
  ),
  history: (
    <>
      <circle cx="16" cy="16" r="12" fill="#fff" stroke="#3a5c8f" strokeWidth="2" />
      <path d="M16 8v8l5 3" stroke="#1b3f8b" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </>
  ),
  warning: (
    <>
      <path d="M16 3l14 25H2z" fill="#ffd23b" stroke="#a87700" strokeLinejoin="round" />
      <path d="M16 11v9" stroke="#222" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="24" r="1.8" fill="#222" />
    </>
  ),
  check: (
    <>
      <circle cx="16" cy="16" r="12.5" fill="#3cb043" stroke="#1d6d22" />
      <path d="M9.5 16.5l4.5 4.5 8.5-9" stroke="#fff" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  fail: (
    <>
      <circle cx="16" cy="16" r="12.5" fill="#e2552c" stroke="#8f2a0d" />
      <path d="M11 11l10 10M21 11L11 21" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
    </>
  ),
  neutral: (
    <>
      <circle cx="16" cy="16" r="12.5" fill="#a9adb5" stroke="#5f636b" />
      <path d="M10 16h12" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
    </>
  ),
  pr: (
    <>
      <path d="M9 9v14" stroke="#2b4a86" strokeWidth="2.6" />
      <path d="M23 22v-8c0-2.8-2.2-5-5-5h-5" stroke="#2b4a86" strokeWidth="2.6" fill="none" />
      <path d="M16.5 5l-4 4 4 4" stroke="#2b4a86" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="6.5" r="3.6" fill="#7cc0ff" stroke="#173e93" />
      <circle cx="9" cy="25.5" r="3.6" fill="#7cc0ff" stroke="#173e93" />
      <circle cx="23" cy="25.5" r="3.6" fill="#5fd068" stroke="#1d6d22" />
    </>
  ),
  external: (
    <>
      <rect x="4" y="8" width="20" height="20" rx="2" fill="#fff" stroke="#3a5c8f" strokeWidth="1.6" />
      <rect x="4" y="8" width="20" height="4" fill="#2f6be6" stroke="#3a5c8f" strokeWidth="1.6" />
      <path d="M15 17L28 4M20 4h8v8" stroke="#2a8c2e" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  info: (
    <>
      <circle cx="16" cy="16" r="12.5" fill="#2f6be6" stroke="#173e93" />
      <circle cx="16" cy="10" r="2" fill="#fff" />
      <path d="M16 14.5v9" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
    </>
  ),
  power: (
    <>
      <rect x="3" y="3" width="26" height="26" rx="4" fill="#e2552c" stroke="#8f2a0d" />
      <path d="M11 11a7.5 7.5 0 1 0 10 0" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M16 7v9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
  help: (
    <>
      <circle cx="16" cy="16" r="12.5" fill="#2f6be6" stroke="#173e93" />
      <path d="M12 12.5a4 4 0 1 1 5.5 3.7c-1 .5-1.5 1.2-1.5 2.3v1" stroke="#fff" strokeWidth="2.8" fill="none" strokeLinecap="round" />
      <circle cx="16" cy="24" r="1.8" fill="#fff" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="6" width="26" height="6" rx="1" fill="#c9a26a" stroke="#6e4f22" />
      <path d="M5 12h22v14c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1z" fill="#e2c08b" stroke="#6e4f22" />
      <rect x="12" y="15" width="8" height="3" rx="1" fill="#8a6634" />
    </>
  ),
  finder: (
    <>
      <rect x="3" y="3" width="26" height="26" rx="5" fill="#5aa8f6" stroke="#1d5aa8" />
      <path d="M16 3v26" stroke="#1d5aa8" />
      <path d="M16 3h8c2.8 0 5 2.2 5 5v16c0 2.8-2.2 5-5 5h-8z" fill="#cfe7ff" />
      <path d="M10 11v3M22 11v3M9 20c4 3 10 3 14 0" stroke="#1b2f55" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </>
  ),
  code: (
    <>
      <rect x="3" y="4" width="26" height="24" rx="3" fill="#2b7bd6" stroke="#174a87" />
      <path d="M12 11l-5 5 5 5M20 11l5 5-5 5" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  refresh: (
    <>
      <path d="M25 13a9.5 9.5 0 1 0 .5 6" stroke="#2a8c2e" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <path d="M27 5v9h-9z" fill="#2a8c2e" />
    </>
  ),
  close: (
    <>
      <rect x="3" y="3" width="26" height="26" rx="4" fill="#e2552c" stroke="#8f2a0d" />
      <path d="M10.5 10.5l11 11M21.5 10.5l-11 11" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  hourglass: (
    <>
      <path d="M8 3h16M8 29h16" stroke="#6e4f22" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M10 4c0 6 5 8 5 12s-5 6-5 12h12c0-6-5-8-5-12s5-6 5-12z" fill="#e7f3ff" stroke="#3a5c8f" />
      <path d="M12.5 26h7c-.5-2.5-2.5-3.5-3.5-5-1 1.5-3 2.5-3.5 5zM12.5 8h7c-.6 1.8-2 3-3.5 4.5C14.5 11 13 9.8 12.5 8z" fill="#e8b440" />
    </>
  ),
  pause: (
    <>
      <circle cx="16" cy="16" r="12.5" fill="#9aa3b3" stroke="#5a6170" />
      <path d="M13 10v12M19 10v12" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
    </>
  ),
  send: (
    <>
      <path d="M3 15L29 4l-6 24-7-8z" fill="#cfe2ff" stroke="#2a4f99" strokeLinejoin="round" />
      <path d="M16 20l13-16" stroke="#2a4f99" />
    </>
  ),
  trash: (
    <>
      <path d="M7 9h18l-1.6 18.5c-.1.8-.7 1.5-1.6 1.5H10.2c-.8 0-1.5-.7-1.6-1.5z" fill="#cfe2e9" stroke="#3d6676" />
      <rect x="5" y="5.5" width="22" height="4" rx="1" fill="#9fc3d1" stroke="#3d6676" />
      <path d="M12.5 13v12M16 13v12M19.5 13v12" stroke="#3d6676" />
    </>
  ),
  import: (
    <>
      <path d="M2 9c0-1 .8-1.8 1.8-1.8h7.4l2.6 2.6h14.4c1 0 1.8.8 1.8 1.8v14c0 1-.8 1.8-1.8 1.8H3.8c-1 0-1.8-.8-1.8-1.8z" fill="#f2c14e" stroke="#b98a1c" />
      <path d="M16 12v10M11.5 17.5l4.5 4.5 4.5-4.5" stroke="#1f6fd6" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  run: (
    <>
      <rect x="3" y="6" width="26" height="20" rx="2" fill="#fff" stroke="#3a5c8f" />
      <rect x="3" y="6" width="26" height="5" fill="#2f6be6" />
      <path d="M8 16h12M16 13l4 3-4 3" stroke="#2a8c2e" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </>
  ),
  bell: (
    <>
      <path d="M16 4c-5 0-8 3.5-8 9v6l-3 4h22l-3-4v-6c0-5.5-3-9-8-9z" fill="#ffd23b" stroke="#a87700" />
      <circle cx="16" cy="26" r="3" fill="#a87700" />
    </>
  ),
  // Small-size cut of the SlashCode mark (design/logo/final/symbol-small.svg), drawn on a 256 grid.
  logo: (
    <>
      <defs>
        <linearGradient id="lg-f" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe48a" />
          <stop offset="1" stopColor="#eab12f" />
        </linearGradient>
        <linearGradient id="lg-s" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3d8cff" />
          <stop offset="1" stopColor="#0b4fd6" />
        </linearGradient>
      </defs>
      <g transform="scale(.125)">
        <path
          d="M38 44h52c5 0 9 2 12 6l12 14h104c8 0 14 6 14 14v120c0 8-6 14-14 14H38c-8 0-14-6-14-14V58c0-8 6-14 14-14z"
          fill="url(#lg-f)"
          stroke="#8a5d08"
          strokeWidth="13"
          strokeLinejoin="round"
        />
        <path d="M145 82h48l-54 120H91z" fill="url(#lg-s)" stroke="#08308f" strokeWidth="9" strokeLinejoin="round" />
      </g>
    </>
  ),
  up: (
    <>
      <path d="M2 9c0-1 .8-1.8 1.8-1.8h7.4l2.6 2.6h14.4c1 0 1.8.8 1.8 1.8v14c0 1-.8 1.8-1.8 1.8H3.8c-1 0-1.8-.8-1.8-1.8z" fill="#f2c14e" stroke="#b98a1c" />
      <path d="M16 23V13M11.5 17.5l4.5-4.5 4.5 4.5" stroke="#2a8c2e" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  mic: (
    <>
      <defs>
        <linearGradient id="mic-a" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a929e" />
          <stop offset=".45" stopColor="#f4f6f9" />
          <stop offset="1" stopColor="#7d8591" />
        </linearGradient>
      </defs>
      <rect x="11" y="2.5" width="10" height="17" rx="5" fill="url(#mic-a)" stroke="#4a515c" />
      <path d="M12.5 8h7M12.5 11h7M12.5 14h7" stroke="#5e6672" strokeWidth=".9" />
      <path d="M7.5 15a8.5 8.5 0 0 0 17 0" fill="none" stroke="#3d4450" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 23.5v4.5M10.5 29h11" stroke="#3d4450" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  layout1: (
    <>
      <rect x="2.5" y="4.5" width="27" height="23" rx="2" fill="#dfe8fb" stroke="#2a4f99" />
      <rect x="2.5" y="4.5" width="27" height="4" rx="2" fill="#2f6be6" />
      <rect x="5" y="10.5" width="22" height="14.5" fill="#0d0d0d" stroke="#45505f" />
    </>
  ),
  layout2: (
    <>
      <rect x="2.5" y="4.5" width="27" height="23" rx="2" fill="#dfe8fb" stroke="#2a4f99" />
      <rect x="2.5" y="4.5" width="27" height="4" rx="2" fill="#2f6be6" />
      <rect x="5" y="10.5" width="10.5" height="14.5" fill="#0d0d0d" stroke="#45505f" />
      <rect x="16.5" y="10.5" width="10.5" height="14.5" fill="#0d0d0d" stroke="#45505f" />
    </>
  ),
  layout3: (
    <>
      <rect x="2.5" y="4.5" width="27" height="23" rx="2" fill="#dfe8fb" stroke="#2a4f99" />
      <rect x="2.5" y="4.5" width="27" height="4" rx="2" fill="#2f6be6" />
      <rect x="5" y="10.5" width="10.5" height="14.5" fill="#0d0d0d" stroke="#45505f" />
      <rect x="16.5" y="10.5" width="10.5" height="6.75" fill="#0d0d0d" stroke="#45505f" />
      <rect x="16.5" y="18.25" width="10.5" height="6.75" fill="#0d0d0d" stroke="#45505f" />
    </>
  ),
  layout4: (
    <>
      <rect x="2.5" y="4.5" width="27" height="23" rx="2" fill="#dfe8fb" stroke="#2a4f99" />
      <rect x="2.5" y="4.5" width="27" height="4" rx="2" fill="#2f6be6" />
      <rect x="5" y="10.5" width="10.5" height="6.75" fill="#0d0d0d" stroke="#45505f" />
      <rect x="16.5" y="10.5" width="10.5" height="6.75" fill="#0d0d0d" stroke="#45505f" />
      <rect x="5" y="18.25" width="10.5" height="6.75" fill="#0d0d0d" stroke="#45505f" />
      <rect x="16.5" y="18.25" width="10.5" height="6.75" fill="#0d0d0d" stroke="#45505f" />
    </>
  )
}

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  // Gradient ids must be unique per instance or every icon would share the first one's defs.
  const suffix = useId().replace(/:/g, '')
  return (
    <svg className={'ico ' + (className ?? '')} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {suffixIds(D[name], suffix)}
    </svg>
  )
}

// Rewrites id="x" / url(#x) pairs so several icons can live on one page.
function suffixIds(node: ReactNode, suffix: string): ReactNode {
  return Children.map(node, (child) => {
    if (!isValidElement(child)) return child
    const props = child.props as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(props)) {
      if (k === 'id' && typeof v === 'string') next[k] = v + suffix
      else if (typeof v === 'string' && v.startsWith('url(#')) next[k] = v.replace(/\)$/, suffix + ')')
    }
    if (props.children) next.children = suffixIds(props.children as ReactNode, suffix)
    return cloneElement(child, next)
  })
}
