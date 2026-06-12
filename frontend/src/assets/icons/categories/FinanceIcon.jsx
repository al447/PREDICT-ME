const FinanceIcon = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="financeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#11998E" />
        <stop offset="100%" stopColor="#38EF7D" />
      </linearGradient>
    </defs>
    <circle cx="16" cy="16" r="14" fill="url(#financeGrad)" opacity="0.15" />
    <circle cx="16" cy="16" r="10" fill="url(#financeGrad)" />
    <path
      d="M16 7C12.14 7 9 10.14 9 14V18C9 21.86 12.14 25 16 25C19.86 25 23 21.86 23 18V14C23 10.14 19.86 7 16 7ZM13 14H15V12H13V14ZM17 14H19V12H17V14ZM13 18H15V16H13V18ZM17 18H19V16H17V18Z"
      fill="white"
    />
    <path d="M11 20H21V21H11V20Z" fill="white" opacity="0.8" />
  </svg>
);

export default FinanceIcon;
