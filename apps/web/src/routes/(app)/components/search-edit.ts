interface SearchLocation {
	readonly pathname: string;
	readonly searchParams: Pick<URLSearchParams, "get">;
}

/**
 * Resolve a debounced edit against the latest search destination. A pending search
 * can differ from the current URL, including when an edit returns to the current query.
 */
export const editedSearchHref = (
	term: string,
	current: SearchLocation,
	pending: SearchLocation = current,
) => {
	if (
		current.pathname !== "/search" ||
		pending.pathname !== "/search" ||
		term === (pending.searchParams.get("q") ?? "")
	) {
		return;
	}

	if (term) {
		return `/search?q=${encodeURIComponent(term)}`;
	}

	return "/search";
};
