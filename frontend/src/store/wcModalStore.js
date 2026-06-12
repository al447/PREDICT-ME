import { create } from 'zustand';

// Holds the WalletConnect QR modal state. The connect flow pushes the live
// `wc:` pairing URI here (captured from the provider's `display_uri` event),
// and registers a `cancel` callback so closing the modal aborts the pending
// connection attempt.
const useWcModalStore = create((set) => ({
  isOpen: false,
  uri: '',
  cancel: null,     // () => void — aborts the pending connect() promise
  walletName: null, // e.g. 'OKX Wallet' — shown in modal header when known
  installUrl: null, // extension install link — shown as "Install the Extension"

  open: (uri, cancel, walletName = null, installUrl = null) =>
    set({ isOpen: true, uri, cancel, walletName, installUrl }),
  setUri: (uri) => set({ uri }),
  close: () => set({ isOpen: false, uri: '', cancel: null, walletName: null, installUrl: null }),
}));

export default useWcModalStore;
