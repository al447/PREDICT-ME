const PoliticsIcon = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="politicsGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#667EEA" />
        <stop offset="100%" stopColor="#764BA2" />
      </linearGradient>
    </defs>
    <circle cx="16" cy="16" r="14" fill="url(#politicsGrad)" opacity="0.15" />
    <circle cx="16" cy="16" r="10" fill="url(#politicsGrad)" />
    <path
      d="M16 7C14.9 7 14 7.9 14 9V10H12V9C12 7.9 11.1 7 10 7C8.9 7 8 7.9 8 9V22H10V9C10 8.45 10.45 8 11 8C11.55 8 12 8.45 12 9V22H14V12C14 11.45 14.45 11 15 11C15.55 11 16 11.45 16 12V22H18V12C18 11.45 18.45 11 19 11C19.55 11 20 11.45 20 12V22H22V12C22 10.9 21.1 10 20 10C19.1 10 18.45 10.45 18 11C18 10.45 17.55 10 17 10C16.45 10 16 10.45 16 11V9C16 7.9 17.1 7 18 7H16ZM10 24H14V25H10V24ZM18 24H22V25H18V24Z"
      fill="white"
    />
  </svg>
);

export default PoliticsIcon;
