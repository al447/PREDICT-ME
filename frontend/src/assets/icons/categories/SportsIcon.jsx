const SportsIcon = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="sportsGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FF6B6B" />
        <stop offset="100%" stopColor="#FF8E8E" />
      </linearGradient>
    </defs>
    <circle cx="16" cy="16" r="14" fill="url(#sportsGrad)" opacity="0.15" />
    <circle cx="16" cy="16" r="10" fill="url(#sportsGrad)" />
    <path
      d="M16 8C11.58 8 8 11.58 8 16C8 20.42 11.58 24 16 24C20.42 24 24 20.42 24 16C24 11.58 20.42 8 16 8ZM19.5 13C20.33 13 21 13.67 21 14.5C21 15.33 20.33 16 19.5 16C18.67 16 18 15.33 18 14.5C18 13.67 18.67 13 19.5 13ZM12.5 13C13.33 13 14 13.67 14 14.5C14 15.33 13.33 16 12.5 16C11.67 16 11 15.33 11 14.5C11 13.67 11.67 13 12.5 13ZM16 20C13.5 20 11.5 18.5 10.5 16.5H21.5C20.5 18.5 18.5 20 16 20Z"
      fill="white"
    />
  </svg>
);

export default SportsIcon;
