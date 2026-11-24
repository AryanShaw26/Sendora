import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  showWordmark = true,
  className = '',
}) => {
  const sizeMap = {
    sm: { icon: 24, text: 'text-base' },
    md: { icon: 32, text: 'text-xl' },
    lg: { icon: 40, text: 'text-2xl' },
  };

  const { icon, text } = sizeMap[size];

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-200 hover:scale-105"
      >
        {/* Envelope base rounded card */}
        <rect
          x="3"
          y="7"
          width="30"
          height="22"
          rx="5"
          fill="#FFFFFF"
          stroke="#D93025"
          strokeWidth="2.2"
        />
        {/* Flap accent triangles on corners */}
        <polygon points="3,7 10,7 3,14" fill="#EE7B72" />
        <polygon points="33,7 26,7 33,14" fill="#A50E0E" />
        {/* Flap V mark */}
        <path
          d="M3 8 L18 20 L33 8"
          stroke="#D93025"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showWordmark && (
        <span className={`font-display font-semibold tracking-tight text-ink ${text}`}>
          Send<span className="text-red-600">ora</span>
        </span>
      )}
    </div>
  );
};
