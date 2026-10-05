export function requestedByPage(request: Request, destinations: ReadonlySet<string>) {
	const site = request.headers.get("sec-fetch-site");
	const destination = request.headers.get("sec-fetch-dest");

	return (
		(site === null || site === "same-origin") &&
		(destination === null || destinations.has(destination))
	);
}
