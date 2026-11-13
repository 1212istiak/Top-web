import { useSyncExternalStore } from "react";

export type Lang = "en" | "bn";

const KEY = "tvr_lang";
const EVENT = "tvr-lang-change";

// Used when localStorage is unavailable, so the switch still works for the visit.
let memoryLang: Lang | null = null;

function read(): Lang {
  if (memoryLang) return memoryLang;
  try {
    return localStorage.getItem(KEY) === "bn" ? "bn" : "en";
  } catch {
    return "en";
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** English / Bengali choice, shared by every switch on the page (about box and FAQ). */
export function useLang() {
  const lang = useSyncExternalStore(subscribe, read, () => "en" as Lang);

  const setLang = (next: Lang) => {
    memoryLang = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable, ignore */
    }
    window.dispatchEvent(new Event(EVENT));
  };

  return [lang, setLang] as const;
}
