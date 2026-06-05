const TrendingUpIcon = ({ size = 16, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M3 17L8 12L11 15L16 10L17 11V7H13L14 8L11 11L8 8L3 13V17Z"
      fill="var(--color-green)"
    />
  </svg>
);

export default TrendingUpIcon;
