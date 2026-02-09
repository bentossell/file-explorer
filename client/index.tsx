import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  icon: string;
  size: number;
  modified?: string;
}

interface Breadcrumb {
  name: string;
  path: string;
}

interface DirectoryResponse {
  path: string;
  breadcrumbs: Breadcrumb[];
  files: FileItem[];
}

interface RecentFile {
  path: string;
  name: string;
  accessedAt: number;
  type: string;
  size: number;
}

interface PreviewData {
  type: "image" | "text" | "unsupported";
  content?: string;
  mimeType?: string;
  language?: string;
  message?: string;
}

interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  created: string;
  modified: string;
  accessed: string;
  icon: string;
  type: string;
}

interface Device {
  id: string;
  name: string;
  url: string;
  icon?: string;
  enabled: boolean;
  isLocal?: boolean;
}

interface ComboView {
  id: string;
  name: string;
  icon: string;
  deviceIds: string[];
}

interface Settings {
  localName?: string;
  localIcon?: string;
  comboViews: ComboView[];
}

// ─── Theme ───────────────────────────────────────────────────────────────────

function useTheme() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

// ─── Favourites ──────────────────────────────────────────────────────────────

interface Favourite {
  path: string;
  name: string;
  icon: string;
  isDirectory: boolean;
  addedAt: number;
}

function useFavourites() {
  const [favourites, setFavourites] = useState<Favourite[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("favourites") || "[]");
    } catch {
      return [];
    }
  });

  const persist = (next: Favourite[]) => {
    setFavourites(next);
    localStorage.setItem("favourites", JSON.stringify(next));
  };

  const isFavourite = (path: string) => favourites.some((f) => f.path === path);

  const toggle = (item: { path: string; name: string; icon: string; isDirectory: boolean }) => {
    if (isFavourite(item.path)) {
      persist(favourites.filter((f) => f.path !== item.path));
    } else {
      persist([{ ...item, addedAt: Date.now() }, ...favourites]);
    }
  };

  const remove = (path: string) => persist(favourites.filter((f) => f.path !== path));

  return { favourites, isFavourite, toggle, remove };
}

// ─── Icons ───────────────────────────────────────────────────────────────────

const Icons = {
  folder: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M4 4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2H4z" />
    </svg>
  ),
  file: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  image: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
    </svg>
  ),
  video: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
  audio: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
    </svg>
  ),
  code: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  ),
  document: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  archive: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  ),
  search: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  ),
  close: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  download: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  ),
  copy: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
    </svg>
  ),
  grid: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  ),
  list: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" />
    </svg>
  ),
  chevronRight: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  ),
  clock: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  sun: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  ),
  moon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
  ),
  back: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  ),
  eye: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  eyeOff: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  ),
  starOutline: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  ),
  starFilled: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
    </svg>
  ),
  plus: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  ),
  folderPlus: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  ),
  filePlus: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  trash: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  ),
  pencil: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  ),
  duplicate: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
    </svg>
  ),
  upload: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  ),
  command: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
  save: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
    </svg>
  ),
  server: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z" />
    </svg>
  ),
  globe: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  ),
  settings: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  check: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ),
  signal: (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" />
    </svg>
  ),
};

const getIcon = (iconType: string) => Icons[iconType as keyof typeof Icons] || Icons.file;

// ─── File type colors ────────────────────────────────────────────────────────

const fileTypeColors: Record<string, { light: string; dark: string; bg: string; darkBg: string }> = {
  folder:   { light: "text-amber-600",  dark: "dark:text-amber-400",  bg: "bg-amber-50",  darkBg: "dark:bg-amber-950/40" },
  image:    { light: "text-rose-500",   dark: "dark:text-rose-400",   bg: "bg-rose-50",   darkBg: "dark:bg-rose-950/40" },
  video:    { light: "text-violet-500", dark: "dark:text-violet-400", bg: "bg-violet-50", darkBg: "dark:bg-violet-950/40" },
  audio:    { light: "text-emerald-600",dark: "dark:text-emerald-400",bg: "bg-emerald-50",darkBg: "dark:bg-emerald-950/40" },
  code:     { light: "text-sky-600",    dark: "dark:text-sky-400",    bg: "bg-sky-50",    darkBg: "dark:bg-sky-950/40" },
  document: { light: "text-orange-500", dark: "dark:text-orange-400", bg: "bg-orange-50", darkBg: "dark:bg-orange-950/40" },
  archive:  { light: "text-teal-600",   dark: "dark:text-teal-400",   bg: "bg-teal-50",   darkBg: "dark:bg-teal-950/40" },
  file:     { light: "text-ink-400",    dark: "dark:text-ink-400",    bg: "bg-ink-50",    darkBg: "dark:bg-ink-800/40" },
};

// ─── Utilities ───────────────────────────────────────────────────────────────

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "—";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const timeAgo = (timestamp: number): string => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

// ─── API ─────────────────────────────────────────────────────────────────────

// Device-aware API: routes through /api/d/:deviceId/ for multi-device support
function createApi(deviceId: string) {
  const base = `/api/d/${deviceId}`;
  return {
    async getFiles(path: string, showHidden: boolean = false): Promise<DirectoryResponse> {
      const res = await fetch(`${base}/files?path=${encodeURIComponent(path)}&showHidden=${showHidden}`);
      return res.json();
    },
    async search(query: string, path: string = ""): Promise<{ results: FileItem[] }> {
      const res = await fetch(`${base}/search?q=${encodeURIComponent(query)}&path=${encodeURIComponent(path)}`);
      return res.json();
    },
    async getRecent(): Promise<{ files: RecentFile[] }> {
      const res = await fetch(`${base}/recent`);
      return res.json();
    },
    async trackRecent(file: { path: string; name: string; type: string; size: number }) {
      await fetch(`${base}/recent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(file) });
    },
    async getPreview(path: string): Promise<PreviewData> {
      const res = await fetch(`${base}/preview?path=${encodeURIComponent(path)}`);
      return res.json();
    },
    async getInfo(path: string): Promise<FileInfo> {
      const res = await fetch(`${base}/info?path=${encodeURIComponent(path)}`);
      return res.json();
    },
    getDownloadUrl(path: string): string {
      return `${base}/download?path=${encodeURIComponent(path)}`;
    },
    async mkdir(dirPath: string): Promise<{ success?: boolean; error?: string }> {
      const res = await fetch(`${base}/mkdir`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: dirPath }) });
      return res.json();
    },
    async touch(filePath: string, content = ""): Promise<{ success?: boolean; error?: string }> {
      const res = await fetch(`${base}/touch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: filePath, content }) });
      return res.json();
    },
    async rename(from: string, to: string): Promise<{ success?: boolean; error?: string }> {
      const res = await fetch(`${base}/rename`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to }) });
      return res.json();
    },
    async deletePath(targetPath: string): Promise<{ success?: boolean; error?: string }> {
      const res = await fetch(`${base}/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: targetPath }) });
      return res.json();
    },
    async save(filePath: string, content: string): Promise<{ success?: boolean; error?: string }> {
      const res = await fetch(`${base}/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: filePath, content }) });
      return res.json();
    },
    async upload(targetDir: string, file: File): Promise<{ success?: boolean; path?: string; error?: string }> {
      const formData = new FormData(); formData.append("file", file); formData.append("path", targetDir);
      const res = await fetch(`${base}/upload`, { method: "POST", body: formData });
      return res.json();
    },
    async duplicate(srcPath: string): Promise<{ success?: boolean; path?: string; error?: string }> {
      const res = await fetch(`${base}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: srcPath }) });
      return res.json();
    },
  };
}

// Device management API (always local, not device-scoped)
const devicesApi = {
  async list(): Promise<{ devices: Device[] }> {
    const res = await fetch("/api/devices"); return res.json();
  },
  async add(device: { name: string; url: string; icon?: string }): Promise<{ success?: boolean; device?: Device; error?: string }> {
    const res = await fetch("/api/devices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(device) }); return res.json();
  },
  async update(id: string, data: Partial<Device>): Promise<{ success?: boolean; error?: string }> {
    const res = await fetch(`/api/devices/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); return res.json();
  },
  async remove(id: string): Promise<{ success?: boolean; error?: string }> {
    const res = await fetch(`/api/devices/${id}`, { method: "DELETE" }); return res.json();
  },
  async health(id: string): Promise<{ status: string; latency?: number; error?: string }> {
    const res = await fetch(`/api/devices/${id}/health`); return res.json();
  },
  // Settings
  async getSettings(): Promise<Settings> {
    const res = await fetch("/api/settings"); return res.json();
  },
  async updateSettings(data: Partial<Settings>): Promise<{ success?: boolean; settings?: Settings; error?: string }> {
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); return res.json();
  },
  // Combo views
  async listCombos(): Promise<{ combos: ComboView[] }> {
    const res = await fetch("/api/combos"); return res.json();
  },
  async addCombo(combo: { name: string; icon?: string; deviceIds: string[] }): Promise<{ success?: boolean; combo?: ComboView; error?: string }> {
    const res = await fetch("/api/combos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(combo) }); return res.json();
  },
  async updateCombo(id: string, data: Partial<ComboView>): Promise<{ success?: boolean; error?: string }> {
    const res = await fetch(`/api/combos/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); return res.json();
  },
  async removeCombo(id: string): Promise<{ success?: boolean; error?: string }> {
    const res = await fetch(`/api/combos/${id}`, { method: "DELETE" }); return res.json();
  },
};

// ─── Components ──────────────────────────────────────────────────────────────

function FileIcon({ type, size = "md" }: { type: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const colors = fileTypeColors[type] || fileTypeColors.file;
  const sizeClasses = {
    sm: "w-7 h-7 [&>svg]:w-3.5 [&>svg]:h-3.5",
    md: "w-9 h-9 [&>svg]:w-4 [&>svg]:h-4",
    lg: "w-11 h-11 [&>svg]:w-5 [&>svg]:h-5",
    xl: "w-14 h-14 [&>svg]:w-7 [&>svg]:h-7",
  };

  return (
    <span className={`inline-flex items-center justify-center rounded-xl ${sizeClasses[size]} ${colors.light} ${colors.dark} ${colors.bg} ${colors.darkBg}`}>
      {getIcon(type)}
    </span>
  );
}

interface CommandItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  section: "action" | "search";
  onSelect: () => void;
}

function CommandPalette({
  open,
  onClose,
  commands,
  searchQuery,
  onSearchChange,
  searchResults,
  isSearching,
  onSelectFile,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  commands: CommandItem[];
  searchQuery: string;
  onSearchChange: (v: string) => void;
  searchResults: FileItem[];
  isSearching: boolean;
  onSelectFile: (f: FileItem) => void;
  onNavigate: (p: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const isCommand = searchQuery.startsWith(">");
  const cleanQuery = isCommand ? searchQuery.slice(1).trim() : searchQuery;

  const filteredCommands = isCommand
    ? commands.filter((c) => c.label.toLowerCase().includes(cleanQuery.toLowerCase()))
    : commands;

  const showCommands = isCommand || searchQuery.length < 2;
  const showSearch = !isCommand && searchQuery.length >= 2;

  const totalItems = showCommands ? filteredCommands.length : searchResults.length;

  useEffect(() => {
    if (open) {
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => { setSelectedIdx(0); }, [searchQuery]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, totalItems - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && totalItems > 0) {
      e.preventDefault();
      if (showCommands) filteredCommands[selectedIdx]?.onSelect();
      else if (showSearch) {
        const f = searchResults[selectedIdx];
        if (f) { f.isDirectory ? onNavigate(f.path) : onSelectFile(f); }
      }
      onClose();
    }
    else if (e.key === "Escape") onClose();
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-[60] animate-fade-in" onClick={onClose} />
      <div className="fixed inset-x-0 top-[12vh] mx-auto w-full max-w-lg z-[61] animate-slide-up">
        <div className="bg-white dark:bg-ink-900 rounded-2xl shadow-2xl border border-sand-200 dark:border-ink-800 overflow-hidden">
          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-sand-100 dark:border-ink-800">
            <span className="text-sand-400 dark:text-ink-500">{Icons.search}</span>
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={handleKey}
              placeholder='Search files or type ">" for commands…'
              className="flex-1 bg-transparent text-sm text-ink-900 dark:text-ink-100 placeholder-sand-400 dark:placeholder-ink-500 focus:outline-none font-sans"
            />
            {searchQuery && (
              <button onClick={() => onSearchChange("")} className="p-1 rounded-md text-sand-400 dark:text-ink-500 hover:text-ink-700 dark:hover:text-ink-200">
                {Icons.close}
              </button>
            )}
            <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-mono font-medium text-sand-400 dark:text-ink-500 bg-sand-100 dark:bg-ink-800 rounded border border-sand-200 dark:border-ink-700">
              esc
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[50vh] overflow-auto py-1">
            {showCommands && (
              <>
                {!isCommand && filteredCommands.length > 0 && (
                  <div className="px-4 pt-2 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-sand-400 dark:text-ink-600">Actions</span>
                  </div>
                )}
                {filteredCommands.map((cmd, i) => (
                  <button
                    key={cmd.id}
                    onClick={() => { cmd.onSelect(); onClose(); }}
                    className={`flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm transition-colors ${
                      i === selectedIdx
                        ? "bg-sand-100 dark:bg-ink-800 text-ink-900 dark:text-ink-100"
                        : "text-ink-600 dark:text-ink-400 hover:bg-sand-50 dark:hover:bg-ink-800/50"
                    }`}
                  >
                    <span className="text-sand-500 dark:text-ink-500">{cmd.icon}</span>
                    <span className="flex-1 font-medium">{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-sand-400 dark:text-ink-600 bg-sand-100 dark:bg-ink-800 rounded border border-sand-200/50 dark:border-ink-700/50">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                ))}
              </>
            )}

            {showSearch && (
              <>
                {isSearching && (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-sand-200 dark:border-ink-700 border-t-sand-500 dark:border-t-ink-400 rounded-full animate-spin" />
                  </div>
                )}
                {!isSearching && searchResults.length === 0 && (
                  <div className="py-8 text-center text-sm text-sand-400 dark:text-ink-500">No results</div>
                )}
                {!isSearching && searchResults.map((file, i) => (
                  <button
                    key={file.path}
                    onClick={() => { file.isDirectory ? onNavigate(file.path) : onSelectFile(file); onClose(); }}
                    className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
                      i === selectedIdx
                        ? "bg-sand-100 dark:bg-ink-800"
                        : "hover:bg-sand-50 dark:hover:bg-ink-800/50"
                    }`}
                  >
                    <FileIcon type={file.icon} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink-800 dark:text-ink-200 truncate">{file.name}</div>
                      <div className="text-[10px] text-sand-400 dark:text-ink-500 truncate font-mono">{file.path}</div>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function NameDialog({
  open,
  title,
  defaultValue,
  placeholder,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  defaultValue?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(defaultValue || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue || "");
      setTimeout(() => {
        inputRef.current?.focus();
        if (defaultValue) {
          const dot = defaultValue.lastIndexOf(".");
          inputRef.current?.setSelectionRange(0, dot > 0 ? dot : defaultValue.length);
        }
      }, 50);
    }
  }, [open, defaultValue]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-[70] animate-fade-in" onClick={onClose} />
      <div className="fixed inset-x-0 top-[20vh] mx-auto w-full max-w-sm z-[71] animate-slide-up">
        <div className="bg-white dark:bg-ink-900 rounded-2xl shadow-2xl border border-sand-200 dark:border-ink-800 p-5">
          <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100 mb-3">{title}</h3>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) { onSubmit(value.trim()); onClose(); }
              if (e.key === "Escape") onClose();
            }}
            placeholder={placeholder}
            className="w-full bg-sand-50 dark:bg-ink-950 border border-sand-200 dark:border-ink-800 rounded-xl px-3 py-2.5 text-sm text-ink-900 dark:text-ink-100 placeholder-sand-400 dark:placeholder-ink-500 focus:outline-none focus:border-sand-400 dark:focus:border-ink-600 focus:ring-2 focus:ring-sand-200/50 dark:focus:ring-ink-700/50 font-sans"
          />
          <div className="flex gap-2 mt-4">
            <button onClick={onClose} className="flex-1 py-2 text-sm font-medium text-ink-500 dark:text-ink-400 bg-sand-100 dark:bg-ink-800 rounded-xl hover:bg-sand-200 dark:hover:bg-ink-700 transition-colors">
              Cancel
            </button>
            <button
              onClick={() => { if (value.trim()) { onSubmit(value.trim()); onClose(); } }}
              className="flex-1 py-2 text-sm font-semibold text-white dark:text-ink-900 bg-ink-900 dark:bg-ink-100 rounded-xl hover:bg-ink-800 dark:hover:bg-white transition-colors"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  destructive,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") { onConfirm(); onClose(); }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onConfirm, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-[70] animate-fade-in" onClick={onClose} />
      <div className="fixed inset-x-0 top-[20vh] mx-auto w-full max-w-sm z-[71] animate-slide-up">
        <div className="bg-white dark:bg-ink-900 rounded-2xl shadow-2xl border border-sand-200 dark:border-ink-800 p-5">
          <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100 mb-1">{title}</h3>
          <p className="text-sm text-sand-500 dark:text-ink-400 mb-4">{message}</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 text-sm font-medium text-ink-500 dark:text-ink-400 bg-sand-100 dark:bg-ink-800 rounded-xl hover:bg-sand-200 dark:hover:bg-ink-700 transition-colors">
              Cancel
            </button>
            <button
              onClick={() => { onConfirm(); onClose(); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-colors ${
                destructive
                  ? "text-white bg-red-600 hover:bg-red-700"
                  : "text-white dark:text-ink-900 bg-ink-900 dark:bg-ink-100 hover:bg-ink-800 dark:hover:bg-white"
              }`}
            >
              {confirmLabel || "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] animate-slide-up">
      <div className="px-4 py-2.5 rounded-xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-sm font-medium shadow-lg">
        {message}
      </div>
    </div>
  );
}

function Breadcrumbs({ items, onNavigate }: { items: Breadcrumb[]; onNavigate: (path: string) => void }) {
  return (
    <nav className="flex items-center gap-0.5 text-sm overflow-x-auto py-1 scrollbar-none">
      {items.map((item, i) => (
        <React.Fragment key={item.path}>
          {i > 0 && <span className="text-sand-300 dark:text-ink-700 flex-shrink-0 mx-0.5">{Icons.chevronRight}</span>}
          <button
            onClick={() => onNavigate(item.path)}
            className={`px-2 py-1 rounded-lg flex-shrink-0 transition-all ${
              i === items.length - 1
                ? "text-ink-900 dark:text-ink-100 font-semibold bg-sand-100 dark:bg-ink-800"
                : "text-sand-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200 hover:bg-sand-100 dark:hover:bg-ink-800"
            }`}
          >
            {item.name}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}

function FileListItem({
  file,
  onClick,
  onDoubleClick,
  selected,
  viewMode,
  isFav,
  onToggleFav,
}: {
  file: FileItem;
  onClick: () => void;
  onDoubleClick: () => void;
  selected: boolean;
  viewMode: "grid" | "list";
  isFav: boolean;
  onToggleFav: () => void;
}) {
  const starBtn = (pos: string) => (
    <button
      onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
      className={`${pos} p-1 rounded-lg transition-all ${
        isFav
          ? "text-amber-500 dark:text-amber-400"
          : "text-sand-300 dark:text-ink-700 opacity-0 group-hover:opacity-100 hover:text-amber-500 dark:hover:text-amber-400"
      }`}
      title={isFav ? "Remove from favourites" : "Add to favourites"}
    >
      {isFav ? Icons.starFilled : Icons.starOutline}
    </button>
  );

  if (viewMode === "grid") {
    return (
      <div
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        className={`group relative flex flex-col items-center p-4 rounded-2xl transition-all duration-150 cursor-pointer ${
          selected
            ? "bg-white dark:bg-ink-800 shadow-sm ring-1 ring-sand-200 dark:ring-ink-700"
            : "hover:bg-white dark:hover:bg-ink-800/60 hover:shadow-sm"
        }`}
      >
        {starBtn("absolute top-2 right-2")}
        <div className="mb-3 transition-transform duration-150 group-hover:scale-105">
          <FileIcon type={file.icon} size="lg" />
        </div>
        <span className="text-[13px] font-medium text-ink-800 dark:text-ink-200 truncate max-w-full text-center leading-tight">
          {file.name}
        </span>
        {!file.isDirectory && file.size > 0 && (
          <span className="text-[11px] text-sand-500 dark:text-ink-500 mt-1 font-mono">
            {formatFileSize(file.size)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`group flex items-center gap-3 px-3 py-2.5 w-full text-left transition-all duration-150 rounded-xl cursor-pointer ${
        selected
          ? "bg-white dark:bg-ink-800 shadow-sm ring-1 ring-sand-200 dark:ring-ink-700"
          : "hover:bg-white/70 dark:hover:bg-ink-800/40"
      }`}
    >
      <FileIcon type={file.icon} size="sm" />
      <span className="flex-1 text-sm font-medium text-ink-800 dark:text-ink-200 truncate">
        {file.name}
      </span>
      {!file.isDirectory && (
        <>
          <span className="text-xs text-sand-400 dark:text-ink-500 w-16 text-right font-mono tabular-nums">
            {formatFileSize(file.size)}
          </span>
          {file.modified && (
            <span className="hidden sm:block text-xs text-sand-400 dark:text-ink-500 w-20 text-right">
              {formatDate(file.modified)}
            </span>
          )}
        </>
      )}
      {starBtn("")}
    </div>
  );
}

function RecentFilesSection({
  files,
  onFileClick,
}: {
  files: RecentFile[];
  onFileClick: (file: RecentFile) => void;
}) {
  if (files.length === 0) return null;

  return (
    <section className="mb-10 animate-fade-in">
      <div className="flex items-center gap-2 mb-4 px-1">
        <span className="text-sand-400 dark:text-ink-500">{Icons.clock}</span>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-sand-400 dark:text-ink-500">Recents</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 stagger-children">
        {files.slice(0, 12).map((file) => (
          <button
            key={file.path}
            onClick={() => onFileClick(file)}
            className="group flex flex-col items-center p-3.5 rounded-2xl bg-white/60 dark:bg-ink-900/50 hover:bg-white dark:hover:bg-ink-800 border border-sand-100 dark:border-ink-800/50 hover:border-sand-200 dark:hover:border-ink-700 hover:shadow-sm transition-all duration-150"
          >
            <div className="mb-2 transition-transform duration-150 group-hover:scale-105">
              <FileIcon type={file.type} />
            </div>
            <span className="text-[12px] font-medium text-ink-700 dark:text-ink-300 truncate max-w-full text-center">
              {file.name}
            </span>
            <span className="text-[10px] text-sand-400 dark:text-ink-600 mt-0.5 font-mono">
              {timeAgo(file.accessedAt)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function FavouritesSection({
  favourites,
  onFileClick,
  onNavigate,
  onRemove,
}: {
  favourites: Favourite[];
  onFileClick: (fav: Favourite) => void;
  onNavigate: (path: string) => void;
  onRemove: (path: string) => void;
}) {
  if (favourites.length === 0) return null;

  return (
    <section className="mb-10 animate-fade-in">
      <div className="flex items-center gap-2 mb-4 px-1">
        <span className="text-amber-500 dark:text-amber-400">{Icons.starFilled}</span>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-sand-400 dark:text-ink-500">Favourites</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 stagger-children">
        {favourites.map((fav) => (
          <div
            key={fav.path}
            onClick={() => fav.isDirectory ? onNavigate(fav.path) : onFileClick(fav)}
            className="group relative flex flex-col items-center p-3.5 rounded-2xl bg-white/60 dark:bg-ink-900/50 hover:bg-white dark:hover:bg-ink-800 border border-sand-100 dark:border-ink-800/50 hover:border-sand-200 dark:hover:border-ink-700 hover:shadow-sm transition-all duration-150 cursor-pointer"
          >
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(fav.path); }}
              className="absolute top-2 right-2 p-0.5 rounded-md text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove from favourites"
            >
              {Icons.close}
            </button>
            <div className="mb-2 transition-transform duration-150 group-hover:scale-105">
              <FileIcon type={fav.icon} />
            </div>
            <span className="text-[12px] font-medium text-ink-700 dark:text-ink-300 truncate max-w-full text-center">
              {fav.name}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SearchResults({
  results,
  onSelect,
  onNavigate,
}: {
  results: FileItem[];
  onSelect: (file: FileItem) => void;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="space-y-0.5 stagger-children">
      {results.map((file) => (
        <button
          key={file.path}
          onClick={() => file.isDirectory ? onNavigate(file.path) : onSelect(file)}
          className="flex items-center gap-3 px-3 py-2.5 w-full text-left hover:bg-white dark:hover:bg-ink-800/60 rounded-xl transition-all duration-150"
        >
          <FileIcon type={file.icon} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-ink-800 dark:text-ink-200 truncate">{file.name}</div>
            <div className="text-[11px] text-sand-400 dark:text-ink-500 truncate font-mono">{file.path}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function PreviewPanel({ file, onClose, isFav, onToggleFav, onToast, onRefresh, api }: { file: FileItem | null; onClose: () => void; isFav: boolean; onToggleFav: () => void; onToast: (msg: string) => void; onRefresh: () => void; api: ReturnType<typeof createApi> }) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!file || file.isDirectory) {
      setPreview(null);
      setInfo(null);
      setEditing(false);
      return;
    }
    setLoading(true);
    setEditing(false);
    Promise.all([api.getPreview(file.path), api.getInfo(file.path)])
      .then(([p, i]) => { setPreview(p); setInfo(i); if (p.type === "text" && p.content) setEditContent(p.content); })
      .finally(() => setLoading(false));
    api.trackRecent({ path: file.path, name: file.name, type: file.icon, size: file.size });
  }, [file]);

  const copyPath = () => {
    if (file) {
      navigator.clipboard.writeText(file.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = async () => {
    if (!file) return;
    setSaving(true);
    const res = await api.save(file.path, editContent);
    setSaving(false);
    if (res.success) {
      onToast("File saved");
      setEditing(false);
      // Re-fetch preview
      const p = await api.getPreview(file.path);
      setPreview(p);
      onRefresh();
    } else {
      onToast(res.error || "Failed to save");
    }
  };

  // ⌘S to save while editing
  useEffect(() => {
    if (!editing) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editing, editContent]);

  if (!file) return null;

  const isTextFile = preview?.type === "text";

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[380px] md:w-[440px] bg-white dark:bg-ink-900 border-l border-sand-200 dark:border-ink-800 flex flex-col z-50 animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-sand-100 dark:border-ink-800">
        <div className="flex items-center gap-3 min-w-0">
          <FileIcon type={file.icon} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink-900 dark:text-ink-100 truncate">{file.name}</div>
            <div className="text-[11px] text-sand-400 dark:text-ink-500 font-mono truncate">{file.path}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isTextFile && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="p-2 rounded-lg text-sand-400 dark:text-ink-500 hover:text-ink-700 dark:hover:text-ink-200 hover:bg-sand-100 dark:hover:bg-ink-800 transition-colors"
              title="Edit file"
            >
              {Icons.pencil}
            </button>
          )}
          <button
            onClick={onToggleFav}
            className={`p-2 rounded-lg transition-colors ${
              isFav
                ? "text-amber-500 dark:text-amber-400 hover:text-amber-600"
                : "text-sand-300 dark:text-ink-600 hover:text-amber-500 dark:hover:text-amber-400"
            }`}
            title={isFav ? "Remove from favourites" : "Add to favourites"}
          >
            {isFav ? Icons.starFilled : Icons.starOutline}
          </button>
          <button onClick={onClose} className="p-2 hover:bg-sand-100 dark:hover:bg-ink-800 rounded-lg transition-colors text-sand-400 dark:text-ink-500 hover:text-ink-700 dark:hover:text-ink-200">
            {Icons.close}
          </button>
        </div>
      </div>

      {/* Preview / Editor */}
      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-7 h-7 border-2 border-sand-200 dark:border-ink-700 border-t-sand-500 dark:border-t-ink-400 rounded-full animate-spin" />
          </div>
        ) : preview?.type === "image" ? (
          <div className="flex items-center justify-center bg-sand-100 dark:bg-ink-950 rounded-2xl p-4">
            <img
              src={`data:${preview.mimeType};base64,${preview.content}`}
              alt={file.name}
              className="max-w-full max-h-[400px] object-contain rounded-lg"
            />
          </div>
        ) : preview?.type === "text" ? (
          editing ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-sand-400 dark:text-ink-600">Editing</span>
                <div className="flex gap-1.5">
                  <button onClick={() => setEditing(false)} className="px-2.5 py-1 text-xs font-medium text-sand-500 dark:text-ink-400 bg-sand-100 dark:bg-ink-800 rounded-lg hover:bg-sand-200 dark:hover:bg-ink-700 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={saving} className="px-2.5 py-1 text-xs font-semibold text-white dark:text-ink-900 bg-ink-900 dark:bg-ink-100 rounded-lg hover:bg-ink-800 dark:hover:bg-white transition-colors disabled:opacity-50 flex items-center gap-1">
                    {Icons.save}
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                spellCheck={false}
                className="flex-1 min-h-[300px] bg-sand-100 dark:bg-ink-950 rounded-2xl p-4 text-[12px] leading-relaxed text-ink-700 dark:text-ink-300 font-mono border border-sand-200/50 dark:border-ink-800 focus:outline-none focus:border-sand-400 dark:focus:border-ink-600 resize-none"
              />
            </div>
          ) : (
            <pre className="bg-sand-100 dark:bg-ink-950 rounded-2xl p-4 overflow-auto text-[12px] leading-relaxed text-ink-700 dark:text-ink-300 font-mono max-h-[400px] border border-sand-200/50 dark:border-ink-800 cursor-pointer hover:border-sand-300 dark:hover:border-ink-700 transition-colors" onClick={() => setEditing(true)} title="Click to edit">
              {preview.content}
            </pre>
          )
        ) : preview?.type === "unsupported" ? (
          <div className="flex flex-col items-center justify-center h-48 text-sand-400 dark:text-ink-500">
            <FileIcon type={file.icon} size="xl" />
            <p className="mt-4 text-sm">{preview.message}</p>
          </div>
        ) : null}
      </div>

      {/* Info */}
      {info && !editing && (
        <div className="px-5 py-4 border-t border-sand-100 dark:border-ink-800 space-y-2.5">
          {[
            ["Size", formatFileSize(info.size)],
            ["Modified", formatDate(info.modified)],
            ["Type", info.type],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between text-xs">
              <span className="text-sand-400 dark:text-ink-500">{label}</span>
              <span className="text-ink-700 dark:text-ink-300 font-medium capitalize">{val}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {!editing && (
        <div className="px-5 py-4 border-t border-sand-100 dark:border-ink-800 flex gap-2">
          <a
            href={api.getDownloadUrl(file.path)}
            download
            className="flex-1 flex items-center justify-center gap-2 bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-sm font-semibold py-2.5 rounded-xl hover:bg-ink-800 dark:hover:bg-white transition-colors"
          >
            {Icons.download}
            Download
          </a>
          <button
            onClick={copyPath}
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-sand-100 dark:bg-ink-800 text-ink-700 dark:text-ink-300 rounded-xl hover:bg-sand-200 dark:hover:bg-ink-700 transition-colors"
          >
            {Icons.copy}
            {copied ? "Copied!" : "Path"}
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
      <div className="w-16 h-16 rounded-3xl bg-sand-100 dark:bg-ink-800 flex items-center justify-center text-sand-300 dark:text-ink-600 mb-4">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
        </svg>
      </div>
      <p className="text-sm text-sand-400 dark:text-ink-500">{message}</p>
    </div>
  );
}

// ─── Device Components ───────────────────────────────────────────────────────

// ─── Device Manager Modal ────────────────────────────────────────────────────

function DeviceManager({
  open,
  onClose,
  devices,
  combos,
  onRefresh,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  devices: Device[];
  combos: ComboView[];
  onRefresh: () => void;
  onToast: (msg: string) => void;
}) {
  const [tab, setTab] = useState<"devices" | "combos">("devices");
  const [health, setHealth] = useState<Record<string, { status: string; latency?: number }>>({});
  const [addUrl, setAddUrl] = useState("");
  const [addName, setAddName] = useState("");
  const [addIcon, setAddIcon] = useState("🖥️");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [editingLocal, setEditingLocal] = useState(false);
  const [localName, setLocalName] = useState("");
  const [localIcon, setLocalIcon] = useState("");
  // Combo creation
  const [newComboName, setNewComboName] = useState("");
  const [newComboIcon, setNewComboIcon] = useState("📁");
  const [newComboDevices, setNewComboDevices] = useState<string[]>([]);
  const [creatingCombo, setCreatingCombo] = useState(false);

  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // Health check all remotes
      devices.filter((d) => !d.isLocal).forEach(async (d) => {
        try {
          const h = await devicesApi.health(d.id);
          setHealth((prev) => ({ ...prev, [d.id]: h }));
        } catch { setHealth((prev) => ({ ...prev, [d.id]: { status: "unreachable" } })); }
      });
      // Load local settings
      const local = devices.find((d) => d.isLocal);
      if (local) { setLocalName(local.name); setLocalIcon(local.icon || "💻"); }
    }
  }, [open, devices]);

  const handleAddDevice = async () => {
    const url = addUrl.trim().replace(/\/+$/, "");
    if (!url) return;
    setAdding(true);
    setAddError("");
    try {
      let name = addName.trim();
      if (!name) {
        try { name = new URL(url).hostname.replace(/\./g, "-").replace(/^-|-$/g, ""); } catch { name = "device"; }
      }
      const res = await devicesApi.add({ name, url, icon: addIcon });
      if (res.success) {
        onToast(`Connected: ${res.device?.name}`);
        setAddUrl(""); setAddName(""); setAddIcon("🖥️");
        onRefresh();
      } else {
        setAddError(res.error || "Failed to connect");
      }
    } catch {
      setAddError("Invalid URL");
    }
    setAdding(false);
  };

  const handleRemoveDevice = async (id: string, name: string) => {
    const res = await devicesApi.remove(id);
    if (res.success) { onToast(`Removed: ${name}`); onRefresh(); }
  };

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    const res = await devicesApi.update(id, { enabled });
    if (res.success) onRefresh();
  };

  const handleSaveLocal = async () => {
    const res = await devicesApi.updateSettings({ localName: localName.trim() || undefined, localIcon: localIcon.trim() || undefined });
    if (res.success) { onToast("Local device updated"); setEditingLocal(false); onRefresh(); }
  };

  const handleCreateCombo = async () => {
    if (!newComboName.trim() || newComboDevices.length === 0) return;
    setCreatingCombo(true);
    const res = await devicesApi.addCombo({ name: newComboName.trim(), icon: newComboIcon, deviceIds: newComboDevices });
    if (res.success) {
      onToast(`Created view: ${newComboName}`);
      setNewComboName(""); setNewComboIcon("📁"); setNewComboDevices([]);
      onRefresh();
    } else {
      onToast(res.error || "Failed to create");
    }
    setCreatingCombo(false);
  };

  const handleRemoveCombo = async (id: string, name: string) => {
    const res = await devicesApi.removeCombo(id);
    if (res.success) { onToast(`Removed: ${name}`); onRefresh(); }
  };

  const toggleComboDevice = (deviceId: string) => {
    setNewComboDevices((prev) => prev.includes(deviceId) ? prev.filter((d) => d !== deviceId) : [...prev, deviceId]);
  };

  if (!open) return null;

  const emojiPicker = ["💻", "🖥️", "🖲️", "📱", "🏠", "🏢", "☁️", "🌐", "🔧", "⚡", "🎯", "🚀", "📡", "🗄️", "💾", "📁"];

  return (
    <>
      <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-[70] animate-fade-in" onClick={onClose} />
      <div className="fixed inset-x-0 top-[8vh] mx-auto w-full max-w-lg z-[71] animate-slide-up max-h-[84vh] flex flex-col">
        <div className="bg-white dark:bg-ink-900 rounded-2xl shadow-2xl border border-sand-200 dark:border-ink-800 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-sand-100 dark:border-ink-800">
            <h2 className="text-sm font-bold text-ink-900 dark:text-ink-100">Manage Devices</h2>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-sand-100 dark:bg-ink-800">
                {(["devices", "combos"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all capitalize ${
                      tab === t ? "bg-white dark:bg-ink-700 text-ink-900 dark:text-ink-100 shadow-sm" : "text-sand-500 dark:text-ink-400"
                    }`}
                  >
                    {t === "combos" ? "Views" : t}
                  </button>
                ))}
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg text-sand-400 dark:text-ink-500 hover:text-ink-700 dark:hover:text-ink-200 hover:bg-sand-100 dark:hover:bg-ink-800 transition-colors">
                {Icons.close}
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {tab === "devices" && (
              <>
                {/* Device list */}
                {devices.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-sand-50 dark:bg-ink-950 border border-sand-100 dark:border-ink-800">
                    <span className="text-xl leading-none">{d.icon || "💻"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink-800 dark:text-ink-200 truncate">{d.name}</div>
                      <div className="text-[10px] text-sand-400 dark:text-ink-600 font-mono truncate">
                        {d.isLocal ? "This machine" : d.url}
                      </div>
                    </div>
                    {/* Status */}
                    {d.isLocal ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        local
                      </span>
                    ) : health[d.id] ? (
                      <span className={`flex items-center gap-1 text-[10px] ${health[d.id].status === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${health[d.id].status === "ok" ? "bg-emerald-500" : "bg-red-400"}`} />
                        {health[d.id].status === "ok" ? `${health[d.id].latency}ms` : "offline"}
                      </span>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-sand-300 dark:bg-ink-600 animate-pulse" />
                    )}
                    {/* Actions */}
                    {d.isLocal ? (
                      <button
                        onClick={() => setEditingLocal(true)}
                        className="p-1 rounded-md text-sand-400 dark:text-ink-500 hover:text-ink-700 dark:hover:text-ink-200 transition-colors"
                        title="Customize"
                      >
                        {Icons.pencil}
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleEnabled(d.id, !d.enabled)}
                          className={`p-1 rounded-md transition-colors ${d.enabled ? "text-emerald-500 hover:text-emerald-600" : "text-sand-300 dark:text-ink-600 hover:text-sand-500"}`}
                          title={d.enabled ? "Disable" : "Enable"}
                        >
                          {d.enabled ? Icons.check : Icons.close}
                        </button>
                        <button
                          onClick={() => handleRemoveDevice(d.id, d.name)}
                          className="p-1 rounded-md text-sand-300 dark:text-ink-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                          title="Remove"
                        >
                          {Icons.trash}
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {/* Edit local device */}
                {editingLocal && (
                  <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 space-y-2">
                    <div className="text-xs font-semibold text-sky-700 dark:text-sky-400 uppercase tracking-widest">Customize Local Device</div>
                    <div className="flex gap-2">
                      <div className="flex flex-wrap gap-1">
                        {emojiPicker.slice(0, 8).map((e) => (
                          <button
                            key={e}
                            onClick={() => setLocalIcon(e)}
                            className={`w-7 h-7 text-sm rounded-lg transition-all ${localIcon === e ? "bg-sky-200 dark:bg-sky-800 ring-1 ring-sky-400" : "hover:bg-sky-100 dark:hover:bg-sky-900"}`}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      value={localName}
                      onChange={(e) => setLocalName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveLocal(); }}
                      placeholder="Device name"
                      className="w-full bg-white dark:bg-ink-900 border border-sand-200 dark:border-ink-700 rounded-lg px-3 py-2 text-sm text-ink-900 dark:text-ink-100 placeholder-sand-400 dark:placeholder-ink-500 focus:outline-none focus:border-sky-400"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setEditingLocal(false)} className="flex-1 py-1.5 text-xs font-medium text-sand-500 bg-sand-100 dark:bg-ink-800 dark:text-ink-400 rounded-lg">Cancel</button>
                      <button onClick={handleSaveLocal} className="flex-1 py-1.5 text-xs font-semibold text-white dark:text-ink-900 bg-ink-900 dark:bg-ink-100 rounded-lg">Save</button>
                    </div>
                  </div>
                )}

                {/* Add device form */}
                <div className="p-3 rounded-xl border border-dashed border-sand-300 dark:border-ink-700 space-y-2">
                  <div className="text-xs font-semibold text-sand-500 dark:text-ink-400 uppercase tracking-widest">Add Remote Machine</div>
                  <p className="text-[11px] text-sand-400 dark:text-ink-500 leading-relaxed">
                    Run <code className="px-1 py-0.5 bg-sand-100 dark:bg-ink-800 rounded text-[10px] font-mono">bun server/index.ts</code> on the remote machine, then paste its URL here.
                    Uses the same file-explorer code — deploy with <code className="px-1 py-0.5 bg-sand-100 dark:bg-ink-800 rounded text-[10px] font-mono">./deploy.sh &lt;host&gt;</code>
                  </p>
                  <div className="flex gap-2">
                    <div className="flex flex-wrap gap-1 w-auto">
                      {emojiPicker.slice(0, 6).map((e) => (
                        <button
                          key={e}
                          onClick={() => setAddIcon(e)}
                          className={`w-7 h-7 text-sm rounded-lg transition-all ${addIcon === e ? "bg-sand-200 dark:bg-ink-700 ring-1 ring-sand-400 dark:ring-ink-500" : "hover:bg-sand-100 dark:hover:bg-ink-800"}`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="Name (optional, derived from URL)"
                    className="w-full bg-white dark:bg-ink-950 border border-sand-200 dark:border-ink-800 rounded-lg px-3 py-2 text-sm text-ink-900 dark:text-ink-100 placeholder-sand-400 dark:placeholder-ink-500 focus:outline-none focus:border-sand-400 dark:focus:border-ink-600"
                  />
                  <div className="flex gap-2">
                    <input
                      ref={urlRef}
                      value={addUrl}
                      onChange={(e) => { setAddUrl(e.target.value); setAddError(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddDevice(); }}
                      placeholder="http://192.168.1.50:3456"
                      className="flex-1 min-w-0 bg-white dark:bg-ink-950 border border-sand-200 dark:border-ink-800 rounded-lg px-3 py-2 text-sm font-mono text-ink-900 dark:text-ink-100 placeholder-sand-400 dark:placeholder-ink-500 focus:outline-none focus:border-sand-400 dark:focus:border-ink-600"
                    />
                    <button
                      onClick={handleAddDevice}
                      disabled={adding || !addUrl.trim()}
                      className="px-4 py-2 text-sm font-semibold text-white dark:text-ink-900 bg-ink-900 dark:bg-ink-100 rounded-lg hover:bg-ink-800 dark:hover:bg-white transition-colors disabled:opacity-30"
                    >
                      {adding ? "Connecting…" : "Connect"}
                    </button>
                  </div>
                  {addError && <p className="text-xs text-red-500 dark:text-red-400">{addError}</p>}
                </div>
              </>
            )}

            {tab === "combos" && (
              <>
                <p className="text-xs text-sand-400 dark:text-ink-500 leading-relaxed">
                  Create custom views that combine files from multiple machines. Great for "Dev Machines", "Servers", etc.
                </p>

                {/* Existing combos */}
                {combos.map((combo) => (
                  <div key={combo.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-sand-50 dark:bg-ink-950 border border-sand-100 dark:border-ink-800">
                    <span className="text-xl leading-none">{combo.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink-800 dark:text-ink-200">{combo.name}</div>
                      <div className="text-[10px] text-sand-400 dark:text-ink-600">
                        {combo.deviceIds.map((id) => devices.find((d) => d.id === id)?.name || id).join(", ")}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveCombo(combo.id, combo.name)}
                      className="p-1 rounded-md text-sand-300 dark:text-ink-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                      {Icons.trash}
                    </button>
                  </div>
                ))}

                {/* "All Devices" built-in view — shown as info */}
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-sand-50/50 dark:bg-ink-950/50 border border-sand-100/50 dark:border-ink-800/50 opacity-60">
                  <span className="text-xl leading-none">🌐</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-600 dark:text-ink-400">All Devices</div>
                    <div className="text-[10px] text-sand-400 dark:text-ink-600">Built-in — always available</div>
                  </div>
                </div>

                {/* Create new combo */}
                {devices.length >= 2 && (
                  <div className="p-3 rounded-xl border border-dashed border-sand-300 dark:border-ink-700 space-y-2">
                    <div className="text-xs font-semibold text-sand-500 dark:text-ink-400 uppercase tracking-widest">New Custom View</div>
                    <div className="flex gap-2 items-center">
                      <div className="flex gap-1">
                        {["📁", "🏠", "🏢", "⚡", "🔧", "🚀"].map((e) => (
                          <button
                            key={e}
                            onClick={() => setNewComboIcon(e)}
                            className={`w-7 h-7 text-sm rounded-lg transition-all ${newComboIcon === e ? "bg-sand-200 dark:bg-ink-700 ring-1 ring-sand-400" : "hover:bg-sand-100 dark:hover:bg-ink-800"}`}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      value={newComboName}
                      onChange={(e) => setNewComboName(e.target.value)}
                      placeholder="View name (e.g. Dev Machines)"
                      className="w-full bg-white dark:bg-ink-950 border border-sand-200 dark:border-ink-800 rounded-lg px-3 py-2 text-sm text-ink-900 dark:text-ink-100 placeholder-sand-400 dark:placeholder-ink-500 focus:outline-none focus:border-sand-400"
                    />
                    <div className="text-[10px] font-semibold text-sand-400 dark:text-ink-600 uppercase tracking-widest mt-1">Include devices:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {devices.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => toggleComboDevice(d.id)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-all ${
                            newComboDevices.includes(d.id)
                              ? "bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-400 font-medium"
                              : "bg-white dark:bg-ink-900 border-sand-200 dark:border-ink-700 text-sand-600 dark:text-ink-400 hover:border-sand-300"
                          }`}
                        >
                          <span className="text-sm">{d.icon || "💻"}</span>
                          {d.name}
                          {newComboDevices.includes(d.id) && <span className="text-sky-500">{Icons.check}</span>}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={handleCreateCombo}
                      disabled={creatingCombo || !newComboName.trim() || newComboDevices.length === 0}
                      className="w-full py-2 text-sm font-semibold text-white dark:text-ink-900 bg-ink-900 dark:bg-ink-100 rounded-lg hover:bg-ink-800 dark:hover:bg-white transition-colors disabled:opacity-30"
                    >
                      {creatingCombo ? "Creating…" : "Create View"}
                    </button>
                  </div>
                )}
                {devices.length < 2 && (
                  <p className="text-xs text-sand-400 dark:text-ink-500 text-center py-4">Add at least 2 devices to create custom views</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Device Switcher (dropdown in header) ────────────────────────────────────

function DeviceSwitcher({
  devices,
  combos,
  activeId,
  activeComboId,
  unifiedMode,
  onSelect,
  onSelectCombo,
  onToggleUnified,
  onOpenManager,
  onToast,
}: {
  devices: Device[];
  combos: ComboView[];
  activeId: string;
  activeComboId: string | null;
  unifiedMode: boolean;
  onSelect: (id: string) => void;
  onSelectCombo: (id: string) => void;
  onToggleUnified: () => void;
  onOpenManager: () => void;
  onToast: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      devices.filter((d) => !d.isLocal).forEach(async (d) => {
        try {
          const h = await devicesApi.health(d.id);
          setHealth((prev) => ({ ...prev, [d.id]: h.status === "ok" ? "ok" : "off" }));
        } catch { setHealth((prev) => ({ ...prev, [d.id]: "off" })); }
      });
    }
  }, [open]);

  const active = devices.find((d) => d.id === activeId) || devices[0];
  const activeCombo = combos.find((c) => c.id === activeComboId);

  const displayIcon = activeCombo ? activeCombo.icon : unifiedMode ? "🌐" : (active?.icon || "💻");
  const displayName = activeCombo ? activeCombo.name : unifiedMode ? "All Devices" : (active?.name || "Local");

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-sand-100 dark:hover:bg-ink-800 text-ink-700 dark:text-ink-300 transition-all text-sm font-medium"
      >
        <span className="text-base leading-none">{displayIcon}</span>
        <span className="hidden sm:inline max-w-[140px] truncate">{displayName}</span>
        <svg className={`w-3 h-3 text-sand-400 dark:text-ink-500 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-72 bg-white dark:bg-ink-900 rounded-xl shadow-xl border border-sand-200 dark:border-ink-800 overflow-hidden z-50 animate-slide-up">
          {/* Devices */}
          <div className="p-1.5">
            <div className="px-3 pt-1 pb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-sand-400 dark:text-ink-600">Devices</span>
            </div>
            {devices.filter((d) => d.isLocal || d.enabled).map((d) => (
              <button
                key={d.id}
                onClick={() => { onSelect(d.id); setOpen(false); }}
                className={`group flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                  !unifiedMode && !activeComboId && d.id === activeId
                    ? "bg-sand-100 dark:bg-ink-800 text-ink-900 dark:text-ink-100 font-medium"
                    : "text-ink-600 dark:text-ink-400 hover:bg-sand-50 dark:hover:bg-ink-800/50"
                }`}
              >
                <span className="text-base leading-none">{d.icon || "💻"}</span>
                <span className="flex-1 truncate">{d.name}</span>
                {!d.isLocal && health[d.id] && (
                  <span className={`flex items-center ${health[d.id] === "ok" ? "text-emerald-500" : "text-red-400"}`}>
                    {Icons.signal}
                  </span>
                )}
                {d.isLocal && <span className="text-[10px] text-sand-400 dark:text-ink-600 bg-sand-100 dark:bg-ink-800 px-1.5 py-0.5 rounded">local</span>}
                {!unifiedMode && !activeComboId && d.id === activeId && <span className="text-sky-500">{Icons.check}</span>}
              </button>
            ))}
          </div>

          {/* Views (combos + All Devices) */}
          {(devices.length > 1 || combos.length > 0) && (
            <div className="border-t border-sand-100 dark:border-ink-800 p-1.5">
              <div className="px-3 pt-1 pb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-sand-400 dark:text-ink-600">Views</span>
              </div>
              {/* Custom combos */}
              {combos.map((combo) => (
                <button
                  key={combo.id}
                  onClick={() => { onSelectCombo(combo.id); setOpen(false); }}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    activeComboId === combo.id
                      ? "bg-sand-100 dark:bg-ink-800 text-ink-900 dark:text-ink-100 font-medium"
                      : "text-ink-600 dark:text-ink-400 hover:bg-sand-50 dark:hover:bg-ink-800/50"
                  }`}
                >
                  <span className="text-base leading-none">{combo.icon}</span>
                  <span className="flex-1 truncate">{combo.name}</span>
                  <span className="text-[10px] text-sand-400 dark:text-ink-600">{combo.deviceIds.length} devices</span>
                  {activeComboId === combo.id && <span className="text-sky-500">{Icons.check}</span>}
                </button>
              ))}
              {/* All Devices */}
              {devices.length > 1 && (
                <button
                  onClick={() => { onToggleUnified(); setOpen(false); }}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    unifiedMode && !activeComboId
                      ? "bg-sand-100 dark:bg-ink-800 text-ink-900 dark:text-ink-100 font-medium"
                      : "text-ink-600 dark:text-ink-400 hover:bg-sand-50 dark:hover:bg-ink-800/50"
                  }`}
                >
                  <span className="text-base leading-none">🌐</span>
                  <span className="flex-1">All Devices</span>
                  {unifiedMode && !activeComboId && <span className="text-sky-500">{Icons.check}</span>}
                </button>
              )}
            </div>
          )}

          {/* Manage */}
          <div className="border-t border-sand-100 dark:border-ink-800 p-1.5">
            <button
              onClick={() => { onOpenManager(); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-sm text-ink-500 dark:text-ink-400 hover:bg-sand-50 dark:hover:bg-ink-800/50 transition-colors"
            >
              <span className="text-sand-400 dark:text-ink-500">{Icons.settings}</span>
              <span>Manage Devices…</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

function App() {
  const theme = useTheme();
  const favs = useFavourites();

  // Device state
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState("local");
  const [unifiedMode, setUnifiedMode] = useState(false);
  const [combos, setCombos] = useState<ComboView[]>([]);
  const [activeComboId, setActiveComboId] = useState<string | null>(null);
  const [deviceManagerOpen, setDeviceManagerOpen] = useState(false);

  const api = createApi(activeDeviceId);

  const loadDevices = useCallback(async () => {
    try {
      const [devData, comboData] = await Promise.all([devicesApi.list(), devicesApi.listCombos()]);
      setDevices(devData.devices);
      setCombos(comboData.combos);
    } catch { /* */ }
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  const [currentPath, setCurrentPath] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FileItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [showHidden, setShowHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("showHidden") === "true";
  });
  const [loading, setLoading] = useState(true);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  // Command palette & dialogs
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [nameDialog, setNameDialog] = useState<{ title: string; defaultValue?: string; placeholder?: string; onSubmit: (v: string) => void } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; confirmLabel?: string; destructive?: boolean; onConfirm: () => void } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string) => setToast(msg), []);

  // ⌘. dotfiles, ⌘K palette, Delete/Backspace to delete, Enter to rename
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture if typing in input/textarea
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA";

      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen(true);
        setCmdQuery("");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        setShowHidden((prev) => { const next = !prev; localStorage.setItem("showHidden", String(next)); return next; });
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "N") {
        e.preventDefault();
        promptNewFolder();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n" && !e.shiftKey) {
        // Only if not in an input
        if (!isInput) { e.preventDefault(); promptNewFile(); }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "u") {
        e.preventDefault();
        fileInputRef.current?.click();
      }

      if (isInput) return;

      if (e.key === "Backspace" && selectedFile) {
        e.preventDefault();
        promptDelete(selectedFile);
      }
      if (e.key === "Enter" && selectedFile) {
        e.preventDefault();
        promptRename(selectedFile);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "d" && selectedFile) {
        e.preventDefault();
        handleDuplicate(selectedFile);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedFile, currentPath]);

  // Directory loading
  const loadDirectory = useCallback(async (dirPath: string, hidden?: boolean) => {
    setLoading(true);
    try {
      // Determine which device list to show for unified/combo view
      const isMultiView = (unifiedMode || activeComboId) && dirPath === "";
      if (isMultiView) {
        let viewDevices: Device[];
        let viewName: string;

        if (activeComboId) {
          const combo = combos.find((c) => c.id === activeComboId);
          viewDevices = combo ? devices.filter((d) => combo.deviceIds.includes(d.id) && (d.isLocal || d.enabled)) : [];
          viewName = combo?.name || "Custom View";
        } else {
          viewDevices = devices.filter((d) => d.isLocal || d.enabled);
          viewName = "All Devices";
        }

        // Check health in parallel for status indicators
        const healthResults: Record<string, string> = {};
        await Promise.allSettled(viewDevices.map(async (d) => {
          if (d.isLocal) { healthResults[d.id] = "ok"; return; }
          try {
            const h = await devicesApi.health(d.id);
            healthResults[d.id] = h.status === "ok" ? "ok" : "off";
          } catch { healthResults[d.id] = "off"; }
        }));

        const deviceFolders: FileItem[] = viewDevices.map((d) => ({
          name: `${d.icon || "💻"} ${d.name}${healthResults[d.id] === "off" ? " (offline)" : ""}`,
          path: `__device__:${d.id}`,
          isDirectory: true,
          icon: "folder",
          size: 0,
          modified: undefined,
        }));
        setFiles(deviceFolders);
        setBreadcrumbs([{ name: viewName, path: "" }]);
        setCurrentPath("");
      } else {
        const data = await api.getFiles(dirPath, hidden ?? showHidden);
        setFiles(data.files);
        setBreadcrumbs(data.breadcrumbs);
        setCurrentPath(dirPath);
      }
    } catch (error) {
      console.error("Failed to load directory:", error);
    } finally {
      setLoading(false);
    }
  }, [showHidden, api, unifiedMode, activeComboId, combos, devices]);

  const loadRecent = useCallback(async () => {
    try {
      const data = await api.getRecent();
      setRecentFiles(data.files);
    } catch (error) {
      console.error("Failed to load recent files:", error);
    }
  }, [api]);

  const refresh = useCallback(() => { loadDirectory(currentPath || ""); loadRecent(); }, [loadDirectory, loadRecent, currentPath]);

  // Reload when device changes or showHidden or unifiedMode or combo changes
  useEffect(() => {
    setCurrentPath("");
    setSelectedFile(null);
    loadDirectory("");
    loadRecent();
  }, [activeDeviceId, showHidden, unifiedMode, activeComboId]);

  // Search (for command palette)
  useEffect(() => {
    const q = cmdQuery.startsWith(">") ? "" : cmdQuery;
    if (q.length < 2) { setSearchResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const data = await api.search(q, currentPath);
        setSearchResults(data.results);
      } catch { /* */ }
      finally { setIsSearching(false); }
    }, 200);
  }, [cmdQuery, currentPath]);

  const [cameFromUnified, setCameFromUnified] = useState(false);
  const [cameFromComboId, setCameFromComboId] = useState<string | null>(null);

  // Navigation
  const handleNavigate = (navPath: string) => {
    // Handle unified/combo mode device "folders"
    if (navPath.startsWith("__device__:")) {
      const deviceId = navPath.replace("__device__:", "");
      if (activeComboId) setCameFromComboId(activeComboId);
      setCameFromUnified(true);
      setActiveDeviceId(deviceId);
      setUnifiedMode(false);
      setActiveComboId(null);
      return;
    }
    setCmdQuery("");
    setSelectedFile(null);
    loadDirectory(navPath);
  };

  const handleBackToUnified = () => {
    setCameFromUnified(false);
    if (cameFromComboId) {
      setActiveComboId(cameFromComboId);
      setCameFromComboId(null);
    } else {
      setUnifiedMode(true);
    }
  };

  const handleFileClick = (file: FileItem) => {
    if (file.isDirectory) handleNavigate(file.path);
    else setSelectedFile(file);
  };

  const handleFileDoubleClick = (file: FileItem) => {
    if (file.isDirectory) handleNavigate(file.path);
  };

  const handleRecentClick = (file: RecentFile) => {
    setSelectedFile({ name: file.name, path: file.path, isDirectory: false, icon: file.type, size: file.size });
  };

  // ── File operations ──

  const promptNewFolder = () => {
    setNameDialog({
      title: "New Folder",
      placeholder: "Folder name",
      onSubmit: async (name) => {
        const p = currentPath ? `${currentPath}/${name}` : name;
        const res = await api.mkdir(p);
        if (res.success) { showToast(`Created folder: ${name}`); refresh(); }
        else showToast(res.error || "Failed to create folder");
      },
    });
  };

  const promptNewFile = () => {
    setNameDialog({
      title: "New File",
      placeholder: "file.txt",
      onSubmit: async (name) => {
        const p = currentPath ? `${currentPath}/${name}` : name;
        const res = await api.touch(p);
        if (res.success) { showToast(`Created file: ${name}`); refresh(); }
        else showToast(res.error || "Failed to create file");
      },
    });
  };

  const promptRename = (file: FileItem) => {
    setNameDialog({
      title: "Rename",
      defaultValue: file.name,
      placeholder: "New name",
      onSubmit: async (name) => {
        const dir = file.path.includes("/") ? file.path.split("/").slice(0, -1).join("/") : "";
        const newPath = dir ? `${dir}/${name}` : name;
        const res = await api.rename(file.path, newPath);
        if (res.success) {
          showToast(`Renamed to ${name}`);
          if (selectedFile?.path === file.path) setSelectedFile(null);
          refresh();
        } else showToast(res.error || "Failed to rename");
      },
    });
  };

  const promptDelete = (file: FileItem) => {
    setConfirmDialog({
      title: `Delete ${file.isDirectory ? "folder" : "file"}?`,
      message: `"${file.name}" will be permanently deleted.`,
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        const res = await api.deletePath(file.path);
        if (res.success) {
          showToast(`Deleted: ${file.name}`);
          if (selectedFile?.path === file.path) setSelectedFile(null);
          refresh();
        } else showToast(res.error || "Failed to delete");
      },
    });
  };

  const handleDuplicate = async (file: FileItem) => {
    const res = await api.duplicate(file.path);
    if (res.success) { showToast(`Duplicated: ${file.name}`); refresh(); }
    else showToast(res.error || "Failed to duplicate");
  };

  const handleUpload = async (fileList: FileList) => {
    for (const f of Array.from(fileList)) {
      const res = await api.upload(currentPath, f);
      if (res.success) showToast(`Uploaded: ${f.name}`);
      else showToast(res.error || `Failed to upload ${f.name}`);
    }
    refresh();
  };

  // Drag and drop
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files);
  };

  // Command palette commands
  const commands: CommandItem[] = [
    { id: "new-folder", label: "New Folder", icon: Icons.folderPlus, shortcut: "⌘⇧N", section: "action", onSelect: promptNewFolder },
    { id: "new-file", label: "New File", icon: Icons.filePlus, shortcut: "⌘N", section: "action", onSelect: promptNewFile },
    { id: "upload", label: "Upload File", icon: Icons.upload, shortcut: "⌘U", section: "action", onSelect: () => fileInputRef.current?.click() },
    ...(selectedFile ? [
      { id: "rename", label: `Rename "${selectedFile.name}"`, icon: Icons.pencil, shortcut: "↵", section: "action" as const, onSelect: () => promptRename(selectedFile!) },
      { id: "duplicate", label: `Duplicate "${selectedFile.name}"`, icon: Icons.duplicate, shortcut: "⌘D", section: "action" as const, onSelect: () => handleDuplicate(selectedFile!) },
      { id: "delete", label: `Delete "${selectedFile.name}"`, icon: Icons.trash, shortcut: "⌫", section: "action" as const, onSelect: () => promptDelete(selectedFile!) },
    ] : []),
    { id: "toggle-hidden", label: showHidden ? "Hide Dotfiles" : "Show Dotfiles", icon: showHidden ? Icons.eyeOff : Icons.eye, shortcut: "⌘.", section: "action", onSelect: () => setShowHidden((p) => { const n = !p; localStorage.setItem("showHidden", String(n)); return n; }) },
    { id: "toggle-view", label: viewMode === "list" ? "Grid View" : "List View", icon: viewMode === "list" ? Icons.grid : Icons.list, section: "action", onSelect: () => setViewMode((v) => v === "list" ? "grid" : "list") },
    { id: "toggle-theme", label: theme.dark ? "Light Mode" : "Dark Mode", icon: theme.dark ? Icons.sun : Icons.moon, section: "action", onSelect: theme.toggle },
    { id: "manage-devices", label: "Manage Devices…", icon: Icons.settings, section: "action", onSelect: () => setDeviceManagerOpen(true) },
    ...(devices.length > 1 ? [
      { id: "unified-view", label: unifiedMode ? "Exit All Devices View" : "View All Devices", icon: Icons.globe, section: "action" as const, onSelect: () => { setUnifiedMode((u) => !u); setActiveComboId(null); } },
    ] : []),
    ...combos.map((combo) => ({
      id: `combo-${combo.id}`, label: `View: ${combo.name}`, icon: Icons.globe, section: "action" as const,
      onSelect: () => { setActiveComboId(combo.id); setUnifiedMode(false); },
    })),
    ...devices.filter((d) => d.id !== activeDeviceId && (d.isLocal || d.enabled)).map((d) => ({
      id: `switch-${d.id}`, label: `Switch to ${d.name}`, icon: Icons.server, section: "action" as const,
      onSelect: () => { setActiveDeviceId(d.id); setUnifiedMode(false); setActiveComboId(null); },
    })),
  ];

  const fileCount = files.filter((f) => !f.isDirectory).length;
  const folderCount = files.filter((f) => f.isDirectory).length;

  return (
    <div
      className="min-h-screen bg-sand-50 dark:bg-ink-950 text-ink-900 dark:text-ink-100 font-sans transition-colors duration-300"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input for upload */}
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) handleUpload(e.target.files); e.target.value = ""; }} />

      {/* Drag overlay */}
      {dragging && (
        <div className="fixed inset-0 z-[90] bg-sand-50/90 dark:bg-ink-950/90 flex items-center justify-center animate-fade-in">
          <div className="text-center">
            <div className="w-20 h-20 rounded-3xl bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center text-sky-500 mx-auto mb-4">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-ink-700 dark:text-ink-200">Drop files to upload</p>
            <p className="text-sm text-sand-400 dark:text-ink-500 mt-1">to {currentPath || "Home"}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-sand-50/80 dark:bg-ink-950/80 backdrop-blur-xl border-b border-sand-200/60 dark:border-ink-800/60">
        <div className="max-w-5xl mx-auto px-5 py-4">
          <div className="flex items-center gap-4 mb-3">
            {(currentPath || cameFromUnified) && (
              <button
                onClick={() => {
                  if (!currentPath && cameFromUnified) {
                    handleBackToUnified();
                  } else {
                    const parent = currentPath.split("/").slice(0, -1).join("/");
                    if (!parent && cameFromUnified) handleBackToUnified();
                    else handleNavigate(parent);
                  }
                }}
                className="p-2 -ml-2 rounded-xl hover:bg-sand-100 dark:hover:bg-ink-800 text-sand-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200 transition-all"
              >
                {Icons.back}
              </button>
            )}
            <h1 className="text-lg font-bold tracking-tight">Files</h1>
            {devices.length > 0 && (
              <DeviceSwitcher
                devices={devices}
                combos={combos}
                activeId={activeDeviceId}
                activeComboId={activeComboId}
                unifiedMode={unifiedMode}
                onSelect={(id) => { setActiveDeviceId(id); setUnifiedMode(false); setActiveComboId(null); }}
                onSelectCombo={(id) => { setActiveComboId(id); setUnifiedMode(false); }}
                onToggleUnified={() => { setUnifiedMode((u) => !u); setActiveComboId(null); }}
                onOpenManager={() => setDeviceManagerOpen(true)}
                onToast={showToast}
              />
            )}
            <div className="flex-1" />

            {/* View toggle */}
            <div className="flex items-center gap-0.5 p-1 rounded-xl bg-sand-100 dark:bg-ink-800 border border-sand-200/50 dark:border-ink-700/50">
              {(["list", "grid"] as const).map((mode) => (
                <button key={mode} onClick={() => setViewMode(mode)} className={`p-1.5 rounded-lg transition-all ${viewMode === mode ? "bg-white dark:bg-ink-700 text-ink-900 dark:text-ink-100 shadow-sm" : "text-sand-400 dark:text-ink-500 hover:text-ink-700 dark:hover:text-ink-300"}`}>
                  {Icons[mode]}
                </button>
              ))}
            </div>

            {/* Dotfiles toggle */}
            <button
              onClick={() => setShowHidden((prev) => { const next = !prev; localStorage.setItem("showHidden", String(next)); return next; })}
              className={`p-2 rounded-xl transition-all ${showHidden ? "bg-sand-200 dark:bg-ink-700 text-ink-700 dark:text-ink-200" : "text-sand-400 dark:text-ink-500 hover:text-ink-700 dark:hover:text-ink-200 hover:bg-sand-100 dark:hover:bg-ink-800"}`}
              title={`${showHidden ? "Hide" : "Show"} dotfiles (⌘.)`}
            >
              {showHidden ? Icons.eye : Icons.eyeOff}
            </button>

            {/* Theme toggle */}
            <button onClick={theme.toggle} className="p-2 rounded-xl hover:bg-sand-100 dark:hover:bg-ink-800 text-sand-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200 transition-all" title={theme.dark ? "Light mode" : "Dark mode"}>
              {theme.dark ? Icons.sun : Icons.moon}
            </button>
          </div>

          {/* Search trigger (opens command palette) */}
          <button
            onClick={() => { setCmdOpen(true); setCmdQuery(""); }}
            className="w-full flex items-center gap-3 bg-white dark:bg-ink-900 border border-sand-200 dark:border-ink-800 rounded-xl px-3.5 py-2.5 text-sm text-sand-400 dark:text-ink-500 hover:border-sand-300 dark:hover:border-ink-700 transition-all group"
          >
            <span className="text-sand-400 dark:text-ink-500 group-hover:text-sand-600 dark:group-hover:text-ink-300 transition-colors">{Icons.search}</span>
            <span className="flex-1 text-left">Search files or commands…</span>
            <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-mono font-medium text-sand-400 dark:text-ink-500 bg-sand-100 dark:bg-ink-800 rounded-md border border-sand-200 dark:border-ink-700">⌘K</kbd>
          </button>

          {/* Breadcrumbs */}
          {breadcrumbs.length > 0 && (
            <div className="mt-2.5">
              <Breadcrumbs items={breadcrumbs} onNavigate={handleNavigate} />
            </div>
          )}
        </div>
      </header>

      {/* Main */}
      <main className={`max-w-5xl mx-auto px-5 py-6 transition-all duration-200 ${selectedFile ? "sm:mr-[380px] md:mr-[440px]" : ""}`}>
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-7 h-7 border-2 border-sand-200 dark:border-ink-700 border-t-sand-500 dark:border-t-ink-400 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {currentPath === "" && (
              <FavouritesSection
                favourites={favs.favourites}
                onFileClick={(fav) => setSelectedFile({ name: fav.name, path: fav.path, isDirectory: fav.isDirectory, icon: fav.icon, size: 0 })}
                onNavigate={handleNavigate}
                onRemove={favs.remove}
              />
            )}
            {currentPath === "" && <RecentFilesSection files={recentFiles} onFileClick={handleRecentClick} />}

            {/* Directory stats + actions */}
            <div className="flex items-center gap-3 mb-3 px-1">
              {files.length > 0 && (
                <p className="text-[11px] font-medium text-sand-400 dark:text-ink-500 uppercase tracking-widest">
                  {folderCount > 0 && <span>{folderCount} folder{folderCount !== 1 ? "s" : ""}</span>}
                  {folderCount > 0 && fileCount > 0 && <span className="mx-1.5">·</span>}
                  {fileCount > 0 && <span>{fileCount} file{fileCount !== 1 ? "s" : ""}</span>}
                </p>
              )}
              <div className="flex-1" />
              <button onClick={promptNewFolder} className="p-1.5 rounded-lg text-sand-400 dark:text-ink-500 hover:text-ink-700 dark:hover:text-ink-200 hover:bg-sand-100 dark:hover:bg-ink-800 transition-all" title="New folder (⌘⇧N)">
                {Icons.folderPlus}
              </button>
              <button onClick={promptNewFile} className="p-1.5 rounded-lg text-sand-400 dark:text-ink-500 hover:text-ink-700 dark:hover:text-ink-200 hover:bg-sand-100 dark:hover:bg-ink-800 transition-all" title="New file (⌘N)">
                {Icons.filePlus}
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded-lg text-sand-400 dark:text-ink-500 hover:text-ink-700 dark:hover:text-ink-200 hover:bg-sand-100 dark:hover:bg-ink-800 transition-all" title="Upload (⌘U)">
                {Icons.upload}
              </button>
            </div>

            {files.length > 0 ? (
              <div
                className={`stagger-children ${
                  viewMode === "grid"
                    ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5"
                    : "space-y-0.5"
                }`}
              >
                {files.map((file) => (
                  <FileListItem
                    key={file.path}
                    file={file}
                    onClick={() => handleFileClick(file)}
                    onDoubleClick={() => handleFileDoubleClick(file)}
                    selected={selectedFile?.path === file.path}
                    viewMode={viewMode}
                    isFav={favs.isFavourite(file.path)}
                    onToggleFav={() => favs.toggle(file)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState message="This folder is empty" />
            )}
          </>
        )}
      </main>

      {/* Preview */}
      {selectedFile && !selectedFile.isDirectory && (
        <>
          <div className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40 sm:hidden animate-fade-in" onClick={() => setSelectedFile(null)} />
          <PreviewPanel
            file={selectedFile}
            onClose={() => setSelectedFile(null)}
            isFav={selectedFile ? favs.isFavourite(selectedFile.path) : false}
            onToggleFav={() => selectedFile && favs.toggle(selectedFile)}
            onToast={showToast}
            onRefresh={refresh}
            api={api}
          />
        </>
      )}

      {/* Command Palette */}
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        commands={commands}
        searchQuery={cmdQuery}
        onSearchChange={setCmdQuery}
        searchResults={searchResults}
        isSearching={isSearching}
        onSelectFile={(f) => { f.isDirectory ? handleNavigate(f.path) : setSelectedFile(f); }}
        onNavigate={handleNavigate}
      />

      {/* Dialogs */}
      <NameDialog
        open={!!nameDialog}
        title={nameDialog?.title || ""}
        defaultValue={nameDialog?.defaultValue}
        placeholder={nameDialog?.placeholder}
        onSubmit={nameDialog?.onSubmit || (() => {})}
        onClose={() => setNameDialog(null)}
      />
      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title || ""}
        message={confirmDialog?.message || ""}
        confirmLabel={confirmDialog?.confirmLabel}
        destructive={confirmDialog?.destructive}
        onConfirm={confirmDialog?.onConfirm || (() => {})}
        onClose={() => setConfirmDialog(null)}
      />

      {/* Device Manager */}
      <DeviceManager
        open={deviceManagerOpen}
        onClose={() => setDeviceManagerOpen(false)}
        devices={devices}
        combos={combos}
        onRefresh={loadDevices}
        onToast={showToast}
      />

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

// ─── Mount ───────────────────────────────────────────────────────────────────

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
