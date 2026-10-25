import { createContext, useContext } from "react";
import type { EntryMeta } from "../types";

export interface EntryLinks {
  /** All entries outside the trash, newest first. */
  metas: EntryMeta[];
  byId: Map<string, EntryMeta>;
  open: (id: string) => void;
}

export const EntryLinksContext = createContext<EntryLinks>({ metas: [], byId: new Map(), open: () => {} });

export const useEntryLinks = () => useContext(EntryLinksContext);
