import { attempt } from "@sora/shared";
import { sql } from "drizzle-orm";

import { db } from "../../database/client";
import { seriesSubtitles } from "../../database/schema/playback";
import type { ProviderVideo } from "../providers/provider";

const languageNames = new Intl.DisplayNames(["en"], {
	type: "language",
});

/**
 * A language's English name, such as `Brazilian Portuguese` for `pt-BR`, in
 * place of labels providers spell as `Portuguese (- Portuguese(Brazil))`;
 * `null` for a tag that names no language.
 */
export const languageName = (tag: string) => {
	const { data, error } = attempt(() => languageNames.of(tag), RangeError);
	if (error) {
		return null;
	}
	return data && data !== tag ? data : null;
};

/** What resolving a version found, as far as its subtitle languages go. */
interface ResolvedVersion {
	version: {
		hardsub?: boolean;
	} | null;
	videos?: ProviderVideo[];
}

/**
 * The subtitle languages resolved versions are served with: each track's,
 * and English for a sub whose subtitles are burned in.
 */
export const subtitleLanguagesOf = (results: readonly ResolvedVersion[]) => [
	...new Set(
		results.flatMap(({ version, videos }) =>
			version
				? [
						...(version.hardsub ? ["en"] : []),
						...(videos ?? []).flatMap((video) => video.subtitles.map((track) => track.language)),
					]
				: [],
		),
	),
];

/**
 * Adds subtitle languages a stream of the series was served with to those
 * stored for it; see `seriesSubtitles`. Storing none still records that the
 * series was looked at, so it is not probed again.
 */
export const recordSubtitleLanguages = async (seriesId: string, languages: readonly string[]) => {
	await db
		.insert(seriesSubtitles)
		.values({
			checkedAt: new Date(),
			languages: [...languages],
			seriesId,
		})
		.onConflictDoUpdate({
			set: {
				checkedAt: sql`excluded.checked_at`,
				languages: sql`array(select distinct unnest(${seriesSubtitles.languages} || excluded.languages))`,
			},
			target: seriesSubtitles.seriesId,
		});
};
