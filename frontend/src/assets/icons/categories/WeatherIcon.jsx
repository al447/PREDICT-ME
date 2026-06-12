const WeatherIcon = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="weatherGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4ECDC4" />
        <stop offset="100%" stopColor="#44A08D" />
      </linearGradient>
    </defs>
    <circle cx="16" cy="16" r="14" fill="url(#weatherGrad)" opacity="0.15" />
    <circle cx="16" cy="16" r="10" fill="url(#weatherGrad)" />
    <path
      d="M16 9C13.24 9 11 11.24 11 14C8.24 14 6 16.24 6 19C6 21.76 8.24 24 11 24H21C23.76 24 26 21.76 26 19C26 16.24 23.76 14 21 14C21 11.24 18.76 9 16 9ZM13 12H19V14H13V12ZM13 16H19V18H13V16ZM13 20H17V22H13V20Z"
      fill="white"
    />
  </svg>
);

export default WeatherIcon;
