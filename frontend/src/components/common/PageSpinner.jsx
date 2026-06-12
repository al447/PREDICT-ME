import { Loader2 } from 'lucide-react';

export default function PageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
      <Loader2 className="w-8 h-8 animate-spin text-[var(--color-gold)]" />
    </div>
  );
}
