const NewsIcon = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="newsGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FF416C" />
        <stop offset="100%" stopColor="#FF4B2B" />
      </linearGradient>
    </defs>
    <circle cx="16" cy="16" r="14" fill="url(#newsGrad)" opacity="0.15" />
    <circle cx="16" cy="16" r="10" fill="url(#newsGrad)" />
    <path
      d="M11 8H21C22.1 8 23 8.9 23 10V22C23 23.1 22.1 24 21 24H11C9.9 24 9 23.1 9 22V10C9 8.9 9.9 8 11 8ZM11 10V22H21V10H11ZM13 12H19V14H13V12ZM13 16H17V18H13V16ZM13 19H19V21H13V19Z"
      fill="white"
    />
  </svg>
);

export default NewsIcon;
