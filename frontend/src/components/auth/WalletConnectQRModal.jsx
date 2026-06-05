import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import useWcModalStore from '../../store/wcModalStore';
import useThemeStore from '../../store/themeStore';

/* ── Dynamic.xyz-style WalletConnect QR modal ──
   Shows the live WC pairing URI as a scannable QR with a "Copy QR URI"
   action. Closing the modal aborts the pending connection. */
const WalletConnectQRModal = () => {
  const { isOpen, uri, cancel, close, walletName, installUrl } = useWcModalStore();
  const { theme } = useThemeStore();
  const logoSrc = theme === 'light' ? '/lightLogo.png' : '/darkLogo.png';
  // High-contrast (black-on-white, no logo) QR is the most reliable for
  // mobile cameras/scanners — shown when the user clicks "click here".
  const [highContrast, setHighContrast] = useState(false);

  // Reset to the styled QR each time the modal re-opens.
  useEffect(() => {
    if (isOpen) setHighContrast(false);
  }, [isOpen]);

  const handleClose = () => {
    try { cancel?.(); } catch { /* ignore */ }
    close();
  };

  const copyUri = async () => {
    if (!uri) return;
    try {
      await navigator.clipboard.writeText(uri);
      toast.success('QR URI copied to clipboard');
    } catch {
      toast.error('Could not copy URI');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={handleClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="relative w-full max-w-[360px] overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0f] shadow-2xl"
          >
            {/* Top helper bar */}
            <div className="border-b border-white/5 px-6 py-3.5 text-center">
              <p className="text-[15px] font-semibold text-white">
                {walletName ? `Connect ${walletName}` : 'Connect'}
              </p>
              <p className="mt-1 text-[12px] text-gray-400">
                If you&apos;re having issues scanning,{' '}
                <button
                  onClick={() => setHighContrast((v) => !v)}
                  className="font-medium text-blue-400 hover:underline"
                >
                  {highContrast ? 'go back' : 'click here'}
                </button>
              </p>
            </div>

            {/* Close button */}
            <button
              onClick={handleClose}
              aria-label="Close"
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>

            {/* QR code */}
            <div className="flex justify-center px-6 pt-7">
              {uri ? (
                <div className={`rounded-2xl p-3.5 ${highContrast ? 'bg-white' : 'bg-black'}`}>
                  <QRCodeSVG
                    value={uri}
                    size={236}
                    bgColor={highContrast ? '#ffffff' : '#000000'}
                    fgColor={highContrast ? '#000000' : '#ffffff'}
                    level={highContrast ? 'H' : 'M'}
                    imageSettings={
                      highContrast
                        ? undefined
                        : { src: logoSrc, height: 46, width: 46, excavate: true }
                    }
                  />
                </div>
              ) : (
                <div className="flex h-[264px] w-[264px] items-center justify-center rounded-2xl bg-black">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                </div>
              )}
            </div>

            {/* Copy QR URI button */}
            <div className="px-6 pt-6">
              <button
                onClick={copyUri}
                disabled={!uri}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Link2 size={18} />
                Copy QR URI
              </button>
            </div>

            {/* Instructions */}
            <p className="px-8 pt-5 text-center text-[13.5px] leading-relaxed text-gray-300">
              {walletName
                ? <>Scan with the <strong className="text-white">{walletName}</strong> mobile app to connect.</>
                : <>Scan this QR code from your mobile wallet to connect.</>}
            </p>

            {/* Install extension link */}
            {installUrl && (
              <div className="pb-1 pt-2 text-center">
                <a
                  href={installUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-blue-400 hover:underline"
                >
                  Install the Extension
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 10L10 1M10 1H3M10 1V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </a>
              </div>
            )}
            {/* Footer */}
            <div className="pb-5 pt-2 text-center text-[11px] tracking-wide text-gray-600">
              Powered by PolyBet365
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default WalletConnectQRModal;
