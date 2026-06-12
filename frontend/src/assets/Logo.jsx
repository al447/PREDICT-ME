import useThemeStore from '../store/themeStore';

const Logo = ({ size = 36, showText = false, className = '' }) => {
  const { theme } = useThemeStore();
  const src = theme === 'light' ? '/lightLogo.png' : '/darkLogo.png';

  return (
    <div className={`flex items-center gap-2 flex-shrink-0 ${className}`}>
      <img
        src={src}
        alt="PredictMe"
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
      {showText && (
        <span
          className="font-black tracking-wider hidden sm:block"
          style={{
            fontSize: size * 0.36,
            background: 'linear-gradient(135deg, #FFD700, #D4AF37)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          PredictMe
        </span>
      )}
    </div>
  );
};

export default Logo;
