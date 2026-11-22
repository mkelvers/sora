/** Units numbered `numbers`. */
export const numbered = (...numbers: number[]) => numbers.map((number) => ({ number }));

/** The numbers of `units`. */
export const numbersOf = (units: readonly { number: number }[]) => units.map((unit) => unit.number);

/** A finished anime of `episodes` episodes. */
export const finished = (episodes: number | null) => ({
	episodes,
	status: "FINISHED" as const,
});
