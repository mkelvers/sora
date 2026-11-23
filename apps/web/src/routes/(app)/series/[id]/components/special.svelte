<script lang="ts">
	import { getEpisodes, getTitleProgress } from "$routes/(app)/series/[id]/series.remote";
	import type { FranchisePart } from "@sora/sdk";

	import Episode from "./episode.svelte";

	let {
		part,
		selected,
		onoptions,
	}: {
		part: FranchisePart;
		selected: number | null;
		onoptions: (episode: number, watched: boolean) => void;
	} = $props();

	const episodes = $derived(
		getEpisodes({
			backdrop: part.card.backdrop_url,
			id: part.series_id,
			limit: part.episode_count,
			offset: 0,
		}),
	);

	const played = $derived(
		new Map(
			(getTitleProgress(part.series_id).current?.episodes ?? []).map((entry) => [
				entry.episode,
				entry,
			]),
		),
	);
</script>

{#each episodes.current ?? [] as episode (episode.number)}
	<Episode
		series={part.card}
		{episode}
		special={part.episode_count > 1 ? `${part.title} E${episode.number}` : part.title}
		progress={played.get(episode.number)}
		options={selected === episode.number}
		onoptions={() => onoptions(episode.number, !!played.get(episode.number)?.finished)}
	/>
{/each}
