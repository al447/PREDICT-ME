const VolumeIcon = ({ size = 16, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M10 3L6 7H3V13H6L10 17V3ZM12.5 7C13.5 7 14.5 7.5 15 8C15.5 8.5 16 9.5 16 10.5C16 11.5 15.5 12.5 15 13C14.5 13.5 13.5 14 12.5 14V12C13 12 13.5 11.5 13.5 10.5C13.5 9.5 13 9 12.5 9V7ZM12.5 4C14.5 4 16.5 5 17.5 6.5C18.5 8 19 9.5 19 11.5C19 13.5 18.5 15 17.5 16.5C16.5 18 14.5 19 12.5 19V17C14 17 15.5 16.5 16.5 15.5C17.5 14.5 18 13 18 11.5C18 10 17.5 8.5 16.5 7.5C15.5 6.5 14 6 12.5 6V4Z"
      fill="var(--color-text-muted)"
    />
  </svg>
);

export default VolumeIcon;
