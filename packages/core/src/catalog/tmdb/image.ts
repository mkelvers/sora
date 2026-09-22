import { z } from 'zod';

export const tmdbImageFields = {
    aspect_ratio: z.number().optional(),
    file_path: z.string().optional(),
    height: z.number().optional(),
    iso_639_1: z.string().nullable().optional(),
    vote_average: z.number().optional(),
    width: z.number().optional(),
};
