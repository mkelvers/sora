import { createContext, type Snippet } from 'svelte';

export type DropdownContext = {
	readonly value: string;
	select(value: string): void;
	/** Lets the trigger show the chosen option's label. Returns the unregister. */
	register(value: string, label: Snippet): () => void;
};

export const [getDropdown, setDropdown] = createContext<DropdownContext>();
