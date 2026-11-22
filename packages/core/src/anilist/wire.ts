import { z } from "zod";

/** Wire representations of AniList's custom scalars, shared by result validators. */
export const scalarSchemas = {
	CountryCode: z.string(),
	FuzzyDateInt: z.number(),
	Json: z.json(),
};
