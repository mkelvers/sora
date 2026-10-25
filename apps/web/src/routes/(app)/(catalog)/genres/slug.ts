export function slug(genre: string) {
	return genre.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
}
