/** The MELO wordmark, drawn as shapes so it needs no font. Inherits the text colour. */
export function Wordmark({ height = 22, className }: { height?: number; className?: string }) {
  return (
    <svg
      viewBox="178.5 420 643 160"
      height={height}
      width={(height * 643) / 160}
      role="img"
      aria-label="MELO"
      className={className}
      fill="currentColor"
      fillRule="evenodd"
    >
      <path d="M178.5 580V420H222L263.5 490L305 420H348.5V580H312.5V484L277 545H250L214.5 484V580Z" />
      <path d="M384.5 420H494.5V452H420.5V484H482V516H420.5V548H494.5V580H384.5Z" />
      <path d="M530.5 420H566.5V548H635.5V580H530.5Z" />
      <path d="M671.5 500a75 80 0 1 0 150 0a75 80 0 1 0-150 0ZM707.5 500a39 48 0 1 0 78 0a39 48 0 1 0-78 0Z" />
    </svg>
  )
}
