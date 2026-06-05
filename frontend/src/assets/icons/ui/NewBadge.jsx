const NewBadge = ({ className = '' }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30 ${className}`}
  >
    NEW
  </span>
);

export default NewBadge;
