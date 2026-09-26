<script lang="ts">
	import Hero from './_components/Hero.svelte';
	import Resume from './_components/Resume.svelte';
	import Poster from '$lib/components/snippets/Poster.svelte';
	import Shelf from '$lib/components/snippets/Shelf.svelte';
	import { getContinueWatching, getFeatured, getRecommendations, getTrending } from './home.remote';

	const featured = getFeatured();
	const resume = getContinueWatching();
	const recommended = getRecommendations();
	const trending = getTrending();
</script>

<svelte:head>
	<title>Sora</title>
</svelte:head>

<Hero featured={featured.current} resume={resume.current} />

<main class:lifted={featured.current?.length !== 0}>
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
		title="Recommended for you"
		subtitle="Picked from what you watch"
		items={recommended.current}
		key={(series) => series.id}
	>
		{#snippet item(series)}
			<Poster {series} />
		{/snippet}
	</Shelf>

	<Shelf title="Trending now" items={trending.current} key={(series) => series.id}>
		{#snippet item(series)}
			<Poster {series} />
		{/snippet}
	</Shelf>
</main>

<style>
	main {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		gap: 48px;
		padding: calc(var(--nav) + 24px) 0 96px;
	}

	/* The first row rises into the hero's fade. */
	.lifted {
		margin-top: -72px;
		padding-top: 0;
	}
</style>
