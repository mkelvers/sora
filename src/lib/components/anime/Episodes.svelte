<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { episodesSkeleton } from '$lib/components/snippets/episodes-skeleton.svelte';
	import { getEpisodes } from '$lib/remote/anime.remote';
	import type { Season } from '@sora/sdk';

	type Props = {
		seriesId: string;
		season: Season;
	};

	let { seriesId, season }: Props = $props();

	let infoOpen = $state<number | null>(null);
</script>

{#if $effect.pending()}
	{@render episodesSkeleton(season.episode_count)}
{/if}

<ol hidden={$effect.pending() > 0}>
	{#each await getEpisodes({
		seriesId,
		seasonId: season.id
	}) as episode (episode.number)}
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
							<dd>{episode.air_date}</dd>
						{/if}
						{#if episode.audio?.length}
							<dt>Audio</dt>
							<dd class="audio">{episode.audio.join(', ')}</dd>
						{/if}
						{#if episode.filler}
							<dt>Filler</dt>
							<dd>Not in the manga</dd>
						{/if}
					</dl>
				{/if}
			</div>

			<button
				aria-label="Details"
				title="Details"
				aria-expanded={infoOpen === episode.number}
				aria-controls="info-{episode.number}"
				onclick={() => (infoOpen = infoOpen === episode.number ? null : episode.number)}
			>
				<Icon name="info" />
			</button>
		</li>
	{:else}
		<li class="empty">No episodes yet.</li>
	{/each}
</ol>

<style>
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
		aspect-ratio: 3 / 2;
		background: #2a2a2a;
		overflow: hidden;
	}

	.still img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
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
		color: #999;
		font-size: 14px;
	}

	p {
		margin: 0;
		color: #999;
		font-size: 14px;
		line-height: 1.45;
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 16px;
		margin: 12px 0 0;
		padding: 12px 14px;
		background: #1f1f1f;
		font-size: 13px;
	}

	dt {
		color: #999;
	}

	dd {
		margin: 0;
	}

	.audio {
		text-transform: uppercase;
	}

	button {
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
	}

	button:hover {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	button:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.empty {
		display: block;
		color: #999;
	}

	@media (max-width: 720px) {
		li {
			grid-template-columns: 140px minmax(0, 1fr);
			gap: 12px;
		}

		button {
			grid-column: 2;
			margin-left: -10px;
		}
	}
</style>
