<script lang="ts">
	import Resume from './_components/Resume.svelte';
	import Shelf from './_components/Shelf.svelte';
	import Poster from '$lib/components/snippets/Poster.svelte';
	import { getBrowse } from './browse/browse.remote';
	import { getContinueWatching } from './home.remote';

	const resume = getContinueWatching();
	const trending = getBrowse({ sort: 'trending', per_page: 24 });
</script>

<svelte:head>
	<title>Sora</title>
</svelte:head>

<main>
	<Shelf
		title="Continue watching"
		shape="wide"
		items={resume.current}
		key={(entry) => entry.series.id}
	>
		{#snippet item(entry)}
			<Resume item={entry} />
		{/snippet}
	</Shelf>

	<Shelf
		title="Trending now"
		href="/browse?sort=trending"
		items={trending.current?.results}
		key={(series) => series.id}
	>
		{#snippet item(series)}
			<Poster {series} />
		{/snippet}
	</Shelf>
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		gap: 40px;
		padding: 24px 0 64px;
	}
</style>
