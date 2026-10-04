export function slug(genre: string) {
	return genre.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
