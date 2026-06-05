import { create } from 'zustand';

const useDepositModalStore = create((set) => ({
  isOpen: false,
  openDepositModal: () => set({ isOpen: true }),
  closeDepositModal: () => set({ isOpen: false }),
}));

export default useDepositModalStore;
