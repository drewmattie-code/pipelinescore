"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect, type FormEvent } from "react";

interface Props {
  placeholder?: string;
  paramName?: string;
}

/** A search-as-you-type input that updates the URL `?search=` query param. */
export function SearchInput({
  placeholder = "Search nickname…",
  paramName = "search",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initial = params.get(paramName) ?? "";
  const [value, setValue] = useState(initial);

  // Sync local state when the URL changes externally (back button, filter chip).
  // Adjusted during render rather than in an effect: an effect here re-renders
  // the whole subtree a second time on every navigation, and React flags it.
  const [lastFromUrl, setLastFromUrl] = useState(initial);
  if (initial !== lastFromUrl) {
    setLastFromUrl(initial);
    setValue(initial);
  }

  function submit(next: string) {
    const np = new URLSearchParams(params.toString());
    if (next.trim()) np.set(paramName, next.trim());
    else np.delete(paramName);
    // Always reset pagination when searching
    np.delete("offset");
    router.push(`${pathname}${np.toString() ? `?${np.toString()}` : ""}`);
  }

  // Debounced live-search: 250ms after the user stops typing
  useEffect(() => {
    if (value === initial) return;
    const t = setTimeout(() => submit(value), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(value);
  }

  function onClear() {
    setValue("");
    submit("");
  }

  return (
    <form onSubmit={onSubmit} className="relative w-full sm:max-w-sm">
      <div className="relative">
        <span
          className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]"
          aria-hidden
        >
          ⌕
        </span>
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-line-2)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)] focus:outline-none focus:border-[var(--color-emerald)] transition-colors"
          autoComplete="off"
          spellCheck={false}
        />
        {value && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[var(--color-line-2)] text-[var(--color-ink-3)] hover:text-[var(--color-ink)] hover:bg-[var(--color-line)] text-xs flex items-center justify-center transition-colors"
          >
            ×
          </button>
        )}
      </div>
    </form>
  );
}
