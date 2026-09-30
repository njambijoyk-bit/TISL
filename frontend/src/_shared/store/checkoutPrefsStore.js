import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** What the customer picked in the cart (delivery, promo) and at checkout (gift vouchers), kept until the order is placed. */
const useCheckoutPrefs = create(
  persist(
    (set) => ({
      delivery_method: '',
      promo_code: '',
      gift_codes: null,   // null = not chosen yet: every usable voucher is ticked for them
      set: (patch) => set(patch),
      reset: () => set({ delivery_method: '', promo_code: '', gift_codes: null }),
    }),
    { name: 'checkout-prefs' },
  ),
);

export default useCheckoutPrefs;
