type LogoProps = { size: number };

export function LogoMark({ size }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="3 3 60 60" aria-hidden="true">
      <g strokeWidth={6} strokeLinejoin="round">
        <polygon points="10,10 48,10 10,48" fill="#0FB67F" stroke="#0FB67F" />
        <polygon points="56,16 56,56 16,56" fill="#6C4DFF" stroke="#6C4DFF" />
      </g>
    </svg>
  );
}
