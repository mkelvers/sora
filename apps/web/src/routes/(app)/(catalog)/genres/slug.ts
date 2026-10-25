export const slug = (genre: string) => genre.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
