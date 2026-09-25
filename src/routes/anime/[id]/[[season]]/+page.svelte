<script lang="ts">
	import { navigating, page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import type { SeasonEpisode } from '@sora/sdk';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let { series, season } = $derived(data);

	// While another season of this title loads, show it as chosen already,
	// with a skeleton for its episodes.
	let pendingSeason = $derived.by(() => {
		const to = navigating.to;
		if (to?.route.id !== page.route.id || to.params?.id !== series.id) {
			return null;
		}
		const id = to.params?.season;
		return (id ? series.seasons.find((other) => other.id === id) : series.seasons[0]) ?? null;
	});
	let shownSeason = $derived(pendingSeason ?? season);

	/** The episode whose details are open. */
	let infoOpen = $state<number | null>(null);

	$effect(() => {
		void season?.id;
		infoOpen = null;
	});

	const audioLabels = {
		dub: 'Dub',
		sub: 'Sub',
		raw: 'Raw'
	} as const;
</script>

<svelte:head>
	<title>{series.title}</title>
</svelte:head>

<div class="page">
	<header>
		{#if series.backdrop_url}
			<img class="backdrop" src={series.backdrop_url} alt="" />
		{/if}

		<div class="bar">
			<div class="heading">
				<h1>{series.title}</h1>
				{#if shownSeason}
					<span>{shownSeason.title}</span>
				{/if}
			</div>

			<a class="icon-button" href="/anime/{series.id}/artwork" aria-label="Edit artwork" title="Edit artwork">
				<Icon name="edit" />
			</a>
		</div>
	</header>

	<div class="body">
		{#if series.poster_url}
			<img class="poster" src={series.poster_url} alt="" />
		{:else}
			<div class="poster"></div>
		{/if}

		<section>
			{#if series.seasons.length > 1}
				<nav class="seasons" aria-label="Seasons">
					{#each series.seasons as other, index (other.id)}
						<a
							href={index === 0 ? `/anime/${series.id}` : `/anime/${series.id}/${other.id}`}
							aria-current={other.id === shownSeason?.id ? 'page' : undefined}
							data-sveltekit-noscroll
							data-sveltekit-replacestate
						>
							{other.title}
						</a>
					{/each}
				</nav>
			{/if}

			{#if pendingSeason}
				{@render skeleton(pendingSeason.episode_count)}
			{:else if season}
				{#await data.episodes}
					{@render skeleton(season.episode_count)}
				{:then episodes}
					{@render list(episodes)}
				{:catch}
					<p class="empty">Couldn’t load the episodes. Reload the page to try again.</p>
				{/await}
			{/if}
		</section>
	</div>
</div>

{#snippet skeleton(count: number)}
	<ol aria-busy="true" aria-label="Loading episodes">
		{#each { length: Math.min(Math.max(count, 1), 6) }, index (index)}
			<li class="skeleton">
				<div class="still"></div>
				<div class="text">
					<div class="line" style:width="45%"></div>
					<div class="line" style:width="12%"></div>
					<div class="line" style:width="90%"></div>
					<div class="line" style:width="75%"></div>
				</div>
			</li>
		{/each}
	</ol>
{/snippet}

{#snippet list(episodes: SeasonEpisode[])}
	{#if episodes.length === 0}
		<p class="empty">No episodes yet.</p>
	{/if}
	<ol>
		{#each episodes as episode (episode.number)}
			<li>
				<div class="still">
					{#if episode.still_url}
						<img src={episode.still_url} alt="" loading="lazy" />
					{/if}
				</div>

				<div class="text">
					<h2>{episode.number}. {episode.title ?? `Episode ${episode.number}`}</h2>
					{#if episode.runtime_minutes}
						<small>{episode.runtime_minutes}m</small>
					{/if}
					{#if episode.overview}
						<p>{episode.overview}</p>
					{/if}

					{#if infoOpen === episode.number}
						<dl id="info-{episode.number}">
							{#if episode.air_date}
								<dt>Aired</dt>
								<dd>
									{new Date(`${episode.air_date}T00:00:00Z`).toLocaleDateString(undefined, {
										dateStyle: 'long',
										timeZone: 'UTC'
									})}
								</dd>
							{/if}
							{#if episode.runtime_minutes}
								<dt>Runtime</dt>
								<dd>{episode.runtime_minutes} minutes</dd>
							{/if}
							<dt>Audio</dt>
							<dd>
								{#if episode.audio === null}
									Checking…
								{:else if episode.audio.length === 0}
									Not available yet
								{:else}
									{episode.audio.map((audio) => audioLabels[audio]).join(', ')}
								{/if}
							</dd>
							{#if episode.filler}
								<dt>Filler</dt>
								<dd>Not in the manga</dd>
							{/if}
							{#if episode.extra}
								<dt>Extra</dt>
								<dd>Special or recap; can’t be played</dd>
							{/if}
						</dl>
					{/if}
				</div>

				<button
					class="icon-button"
					aria-label="Details"
					title="Details"
					aria-expanded={infoOpen === episode.number}
					aria-controls="info-{episode.number}"
					onclick={() => (infoOpen = infoOpen === episode.number ? null : episode.number)}
				>
					<Icon name="info" />
				</button>
			</li>
		{/each}
	</ol>
{/snippet}

<style>
	:global(body) {
		margin: 0;
	}

	.page {
		--poster: clamp(120px, 25vw, 480px);
		--gap: clamp(16px, 4vw, 80px);
		--side: clamp(16px, 3.3vw, 64px);
		--muted: #999;
		--surface: #1f1f1f;
		min-height: 100vh;
		background: #101010;
		color: #e6e6e6;
		font-family: system-ui, sans-serif;
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

	/* Across the backdrop's foot, its text clear of the poster below it. */
	.bar {
		position: absolute;
		inset: auto 0 0;
		display: flex;
		align-items: center;
		gap: 16px;
		box-sizing: border-box;
		min-height: 108px;
		padding: 16px var(--side) 16px calc(var(--side) + var(--poster) + var(--gap));
		background: rgb(40 40 40 / 0.85);
	}

	.heading {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-right: auto;
	}

	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 400;
	}

	.heading span {
		color: #bbb;
		font-size: 17px;
	}

	.icon-button {
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

	.icon-button:hover {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	.icon-button:focus-visible,
	.seasons a:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.body {
		display: grid;
		grid-template-columns: var(--poster) 1fr;
		gap: var(--gap);
		align-items: start;
		padding: 0 var(--side) 64px;
	}

	/* Starts up in the backdrop, above the bar. */
	.poster {
		display: block;
		position: relative;
		width: 100%;
		aspect-ratio: 2 / 3;
		object-fit: cover;
		margin-top: -192px;
		background: #2a2a2a;
	}

	section {
		min-width: 0;
		padding-top: 40px;
	}

	/* Tabs, scrolling sideways (without a scrollbar) when a title has many seasons. */
	.seasons {
		display: flex;
		gap: 4px;
		margin-bottom: 24px;
		overflow: auto hidden;
		border-bottom: 1px solid #2a2a2a;
		scrollbar-width: none;
	}

	.seasons::-webkit-scrollbar {
		display: none;
	}

	.seasons a {
		flex: none;
		padding: 10px 14px;
		border-bottom: 2px solid transparent;
		color: var(--muted);
		font-size: 15px;
		text-decoration: none;
		transition:
			color 120ms,
			border-color 120ms;
	}

	/* Inside, since the row clips anything outside its tabs. */
	.seasons a:focus-visible {
		outline-offset: -2px;
	}

	.seasons a:hover {
		color: #fff;
	}

	.seasons a[aria-current='page'] {
		border-bottom-color: #fff;
		color: #fff;
	}

	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		grid-template-columns: minmax(160px, 375px) minmax(0, 1fr) auto;
		align-items: center;
		gap: 24px;
		padding: 4px 0;
	}

	.still {
		position: relative;
		width: 100%;
		aspect-ratio: 3 / 2;
		background: #2a2a2a;
		overflow: hidden;
	}

	.still img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: opacity 120ms;
	}

	.text {
		max-width: 70ch;
	}

	h2 {
		margin: 0 0 8px;
		font-size: 15px;
		font-weight: 400;
	}

	small {
		display: block;
		margin-bottom: 8px;
		color: var(--muted);
		font-size: 14px;
	}

	.text p {
		margin: 0;
		color: var(--muted);
		font-size: 14px;
		line-height: 1.45;
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 16px;
		margin: 12px 0 0;
		padding: 12px 14px;
		background: var(--surface);
		font-size: 13px;
	}

	dt {
		color: var(--muted);
	}

	dd {
		margin: 0;
	}

	.empty {
		color: var(--muted);
	}

	.skeleton .still,
	.skeleton .line {
		background: linear-gradient(90deg, #1f1f1f 0%, #2c2c2c 50%, #1f1f1f 100%);
		background-size: 200% 100%;
		animation: shimmer 1.2s linear infinite;
	}

	.skeleton .text {
		display: grid;
		gap: 10px;
	}

	.skeleton .line {
		height: 12px;
	}

	@keyframes shimmer {
		from {
			background-position: 200% 0;
		}
		to {
			background-position: -200% 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.skeleton .still,
		.skeleton .line {
			animation: none;
		}
	}

	@media (max-width: 720px) {
		header {
			height: 240px;
		}

		.bar {
			min-height: 80px;
		}

		h1 {
			font-size: 20px;
		}

		.heading span {
			font-size: 14px;
		}

		.poster {
			margin-top: -120px;
		}

		section {
			grid-column: 1 / -1;
			padding-top: 0;
		}

		li {
			grid-template-columns: 140px minmax(0, 1fr);
			gap: 12px;
		}

		li > .icon-button {
			grid-column: 2;
			margin-left: -10px;
		}
	}
</style>
