const TrendingDownIcon = ({ size = 16, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M3 7L8 12L11 9L16 14L17 13V17H13L14 16L11 13L8 16L3 11V7Z"
      fill="var(--color-red)"
    />
  </svg>
);

export default TrendingDownIcon;
