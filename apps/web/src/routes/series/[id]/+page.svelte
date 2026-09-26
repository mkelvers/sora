<script lang="ts">
	import Details from "./_components/Details.svelte";
	import Episodes from "./_components/Episodes.svelte";
	import Related from "./_components/Related.svelte";
	import Seasons from "./_components/Seasons.svelte";
	import Stats from "./_components/Stats.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import { formatDay, formatTime, tmdbSrcset } from "$lib/utils";
	import { getSeries } from "./series.remote";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const series = $derived(await getSeries(params.id));
	let season = $derived(series.seasons[0]);

	const tags = $derived(
		series.tags
			.filter((tag) => !tag.spoiler && (tag.rank ?? 0) >= 60)
			.slice(0, 8)
			.map((tag) => tag.name),
	);

	const next = $derived.by(() => {
		if (!series.next_episode) {
			return undefined;
		}

		const { season_id, number, airing_at } = series.next_episode;
		const airing = new Date(airing_at);
		const season =
			series.seasons.length > 1
				? series.seasons.find((season) => season.id === season_id)
				: undefined;

		return {
			episode: season
				? `${season.title}, episode ${number}`
				: `Episode ${number}`,
			when: `${formatDay(airing)} at ${formatTime(airing)}`,
		};
	});
</script>

<svelte:head>
	<title>{series.title}</title>
</svelte:head>

<div class="page">
	<header>
		{#if series.backdrop_url}
			<img
				class="backdrop"
				src={series.backdrop_url}
				srcset={tmdbSrcset(series.backdrop_url, {
					w780: 780,
					w1280: 1280,
					original: 3840,
				})}
				sizes="100vw"
				alt={series.title}
				loading="eager"
				decoding="async"
			/>
		{/if}

		<div class="bar">
			<div class="heading">
				<h1>{series.title}</h1>
				<Stats {series} />
			</div>

			<a
				href="/series/{series.id}/artwork"
				aria-label="Edit artwork"
				title="Edit artwork"
			>
				<Icon name="edit" />
			</a>
		</div>
	</header>

	<div class="body">
		<aside>
			{#if series.poster_url}
				<img
					class="poster"
					src={series.poster_url}
					srcset={tmdbSrcset(series.poster_url, {
						w342: 342,
						w500: 500,
						w780: 780,
					})}
					sizes="(max-width: 480px) 120px, (min-width: 1920px) 480px, 25vw"
					alt={series.title}
					loading="eager"
					decoding="async"
				/>
			{:else}
				<div class="poster"></div>
			{/if}

			<Details {series} />
		</aside>

		<div class="content">
			{#if series.overview || tags.length || next}
				<div class="about">
					{#if series.overview}
						<p class="overview">{series.overview}</p>
					{/if}

					{#if tags.length}
						<ul class="tags" aria-label="Tags">
							{#each tags as tag (tag)}
								<li>{tag}</li>
							{/each}
						</ul>
					{/if}

					{#if next}
						<p class="next">
							<span class="label">Next episode</span>
							{next.episode} airs {next.when}
						</p>
					{/if}
				</div>
			{/if}

			<section aria-labelledby="episodes">
				<div class="section-head">
					<h2 id="episodes">Episodes</h2>
					{#if series.seasons.length > 1}
						<Seasons seasons={series.seasons} bind:season />
					{/if}
				</div>

				<Episodes seriesId={series.id} {season} />
			</section>

			{#if series.related.length}
				<Related related={series.related} />
			{/if}
		</div>
	</div>
</div>

<style>
	.page {
		--poster: clamp(120px, 25vw, 480px);
		--gap: clamp(16px, 4vw, 80px);
		--side: clamp(16px, 3.3vw, 64px);
		min-height: 100vh;
	}

	header {
		position: relative;
		height: 432px;
		background: #1c1c1c;
	}

	.backdrop {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.bar {
		position: absolute;
		inset: auto 0 0;
		display: flex;
		align-items: center;
		gap: 16px;
		box-sizing: border-box;
		min-height: 108px;
		padding: 16px var(--side) 16px
			calc(var(--side) + var(--poster) + var(--gap));
		background: rgb(40 40 40 / 0.85);
	}

	.heading {
		display: grid;
		gap: 8px;
		min-width: 0;
		margin-right: auto;
	}

	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 400;
	}

	.bar a {
		display: inline-grid;
		place-items: center;
		width: 40px;
		height: 40px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: none;
		color: #ddd;
		cursor: pointer;
		transition:
			background 120ms,
			color 120ms;
	}

	.bar a:hover {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	.bar a:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.body {
		display: grid;
		grid-template-columns: var(--poster) minmax(0, 1fr);
		gap: var(--gap);
		align-items: start;
		padding: 0 var(--side) 64px;
	}

	aside {
		display: grid;
		gap: 32px;
	}

	.poster {
		display: block;
		position: relative;
		width: 100%;
		aspect-ratio: 2 / 3;
		object-fit: cover;
		margin-top: -192px;
		background: #2a2a2a;
	}

	.content {
		display: grid;
		gap: 48px;
		padding-top: 40px;
	}

	.about {
		display: grid;
		gap: 20px;
		max-width: 75ch;
	}

	.overview {
		margin: 0;
		color: #ccc;
		font-size: 16px;
		line-height: 1.6;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.tags li {
		padding: 4px 10px;
		background: rgb(255 255 255 / 0.06);
		color: #aaa;
		font-size: 13px;
	}

	.next {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 12px;
		margin: 0;
		padding: 12px 16px;
		border-left: 2px solid #fff;
		background: rgb(255 255 255 / 0.04);
		color: #ccc;
		font-size: 14px;
	}

	.next .label {
		color: #777;
		font-size: 12px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.section-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px 24px;
		margin-bottom: 16px;
	}

	h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 400;
	}
</style>
