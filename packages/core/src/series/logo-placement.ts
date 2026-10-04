/** The ranges the logo's size and offsets in {@link ArtworkChanges} may be chosen in. */
export const logoPlacement = {
	scale: {
		min: 0.5,
		max: 2,
	},
	offset: {
		min: -1,
		max: 1,
	},
} as const;
