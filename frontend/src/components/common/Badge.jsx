const colors = {
  gold: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  green: 'bg-green-500/20 text-green-400 border border-green-500/30',
  red: 'bg-red-500/20 text-red-400 border border-red-500/30',
  blue: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  purple: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  gray: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  new: 'bg-[var(--color-gold)] text-black font-bold',
};

const Badge = ({ children, color = 'gray', className = '' }) => {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[color] || colors.gray} ${className}`}>
      {children}
    </span>
  );
};

export default Badge;
