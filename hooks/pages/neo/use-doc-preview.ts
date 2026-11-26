import { useSyncExternalStore } from "react";

/**
 * The original file a person attached, open in the shared side panel. Opened
 * from the attachment in their own message; closed by the panel's ×, or when
 * another document (Voucher Desk) takes the panel.
 */
let current: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export const openDocPreview = (id: string) => {
  current = id;
  emit();
};
export const closeDocPreview = () => {
  if (current === null) return;
  current = null;
  emit();
};
export const useDocPreview = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => current,
    () => null
  );
