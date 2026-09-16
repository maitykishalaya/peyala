import React from 'react';

/**
 * DiningTableIcon
 * Renders an authentic restaurant dining table with chairs,
 * designed in the standard 24x24 Lucide icon style (strokeWidth 2, rounded caps & joins).
 */
export function DiningTableIcon({
  className,
  size,
  strokeWidth = 2,
  ...props
}: React.ComponentProps<'svg'> & { size?: number | string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Table surface */}
      <path d="M4 10h16" />
      {/* Table legs */}
      <path d="M8 10v10" />
      <path d="M16 10v10" />
      {/* Left chair: backrest, seat, and front leg */}
      <path d="M2 6v14" />
      <path d="M2 13h3v7" />
      {/* Right chair: backrest, seat, and front leg */}
      <path d="M22 6v14" />
      <path d="M22 13h-3v7" />
    </svg>
  );
}

export default DiningTableIcon;
