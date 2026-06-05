const CryptoIcon = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="cryptoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F7931A" />
        <stop offset="100%" stopColor="#FFB84D" />
      </linearGradient>
      <filter id="cryptoGlow">
        <feGaussianBlur stdDeviation="1" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <circle cx="16" cy="16" r="14" fill="url(#cryptoGrad)" filter="url(#cryptoGlow)" opacity="0.15" />
    <circle cx="16" cy="16" r="10" fill="url(#cryptoGrad)" />
    <path
      d="M16 6C10.48 6 6 10.48 6 16C6 21.52 10.48 26 16 26C21.52 26 26 21.52 26 16C26 10.48 21.52 6 16 6ZM19.5 18.5C19.5 20.43 17.93 22 16 22H14V20H16C16.83 20 17.5 19.33 17.5 18.5C17.5 17.67 16.83 17 16 17H14V15H16C16.83 15 17.5 14.33 17.5 13.5C17.5 12.67 16.83 12 16 12H14V10H16C17.93 10 19.5 11.57 19.5 13.5C19.5 14.43 19.1 15.27 18.5 15.87C19.1 16.47 19.5 17.31 19.5 18.5Z"
      fill="white"
    />
    <path d="M13 10V22H11V10H13Z" fill="white" opacity="0.9" />
  </svg>
);

export default CryptoIcon;
