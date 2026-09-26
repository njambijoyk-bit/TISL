import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Valid positions: 'top' | 'bottom' | 'left' | 'right'
const useHeaderPositionStore = create(
  persist(
    (set) => ({
      position: 'top', // default
      setPosition: (position) => set({ position }),
    }),
    {
      name: 'header-position', // localStorage key
    }
  )
);

export default useHeaderPositionStore;