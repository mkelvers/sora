<script lang="ts">
	import type { EpisodeProgress, Season, SeasonEpisode } from '@sora/sdk';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { formatDate, formatMinutes } from '$lib/utils';

	type Props = {
		seriesId: string;
		season: Season;
		episode: SeasonEpisode;
		progress: EpisodeProgress | undefined;
	};

	let { seriesId, season, episode, progress }: Props = $props();

	const audioLabels = { dub: 'Dub', sub: 'Sub', raw: 'Raw' };

	const playable = $derived(!episode.extra && episode.audio?.length !== 0);
	const upcoming = $derived(episode.air_date !== null && new Date(episode.air_date) > new Date());
	const played = $derived(
		progress && !progress.completed && progress.duration_seconds > 0
			? Math.min(progress.position_seconds / progress.duration_seconds, 1)
			: 0
	);
	const title = $derived(
		season.kind === 'movie' ? (episode.title ?? season.title) : `E${episode.number} – ${episode.title ?? `Episode ${episode.number}`}`
	);
</script>

<li>
	<svelte:element
		this={playable ? 'a' : 'div'}
		class="episode"
		class:watched={progress?.completed}
		class:unplayable={!playable}
		href={playable ? `/series/${seriesId}/watch/${season.id}/${episode.number}` : undefined}
		title={episode.overview ?? undefined}
	>
		<div class="still">
			{#if episode.still_url}
				<img src={episode.still_url} alt="" loading="lazy" decoding="async" />
			{:else}
				<span class="number">{episode.number}</span>
			{/if}

			{#if playable}
				<span class="play" aria-hidden="true"><Icon name="play" /></span>
			{/if}

			{#if progress?.completed}
				<span class="badge watched-badge"><Icon name="check" size="sm" /> Watched</span>
			{/if}

			{#if episode.runtime_minutes}
				<span class="badge runtime">{formatMinutes(episode.runtime_minutes)}</span>
			{/if}

			{#if played > 0}
				<span class="bar" style:--played={played}></span>
			{/if}
		</div>

		<h3>{title}</h3>

		<div class="meta">
			{#if !playable && upcoming && episode.air_date}
				<span>Coming {formatDate(episode.air_date)}</span>
			{:else if !playable}
				<span>Unavailable</span>
			{:else if episode.audio}
				<span>{episode.audio.map((audio) => audioLabels[audio]).join(' | ')}</span>
			{/if}
			{#if episode.filler}
				<span class="filler">Filler</span>
			{/if}
		</div>
	</svelte:element>
</li>

<style>
	.episode {
		display: flex;
		flex-direction: column;
		min-width: 0;
		color: inherit;
		text-decoration: none;
		outline: none;
	}

	.still {
		position: relative;
		display: grid;
		place-items: center;
		aspect-ratio: 16 / 9;
		margin-bottom: 14px;
		overflow: hidden;
		background: var(--surface-2);
		transition:
			transform 280ms var(--ease),
			box-shadow 280ms var(--ease);
	}

	.still::after {
		content: '';
		position: absolute;
		inset: 0;
		box-shadow: 0 0 0 1px rgb(255 255 255 / 0.06) inset;
		pointer-events: none;
	}

	img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: filter 280ms var(--ease);
	}

	.number {
		color: var(--surface-3);
		font-size: 56px;
		font-weight: 800;
		letter-spacing: -0.04em;
	}

	.play {
		position: absolute;
		z-index: 1;
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: rgb(255 255 255 / 0.92);
		color: var(--bg);
		opacity: 0;
		transform: scale(0.9);
		transition:
			opacity 200ms var(--ease),
			transform 200ms var(--ease);
	}

	a.episode:hover .still {
		transform: translateY(-4px);
		box-shadow: 0 16px 32px -12px rgb(0 0 0 / 0.8);
	}

	a.episode:hover img {
		filter: brightness(0.7);
	}

	a.episode:hover .play,
	a.episode:focus-visible .play {
		opacity: 1;
		transform: none;
	}

	a.episode:focus-visible .still {
		outline: 2px solid var(--text);
		outline-offset: 3px;
	}

	.badge {
		position: absolute;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 7px;
		border-radius: 4px;
		background: rgb(0 0 0 / 0.72);
		color: var(--text);
		font-size: 12px;
		font-weight: 600;
		backdrop-filter: blur(8px);
	}

	.runtime {
		right: 8px;
		bottom: 8px;
	}

	.watched-badge {
		top: 8px;
		left: 8px;
	}

	.watched img {
		filter: brightness(0.55) saturate(0.7);
	}

	.bar {
		position: absolute;
		inset: auto 0 0;
		z-index: 1;
		height: 4px;
		background: rgb(255 255 255 / 0.2);
	}

	.bar::after {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: calc(var(--played) * 100%);
		background: var(--accent);
	}

	h3 {
		display: -webkit-box;
		margin: 0;
		overflow: hidden;
		font-size: 15px;
		font-weight: 600;
		letter-spacing: -0.005em;
		line-height: 1.4;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 6px;
		color: var(--text-3);
		font-size: 13px;
	}

	.meta:empty {
		display: none;
	}

	.filler {
		padding: 1px 6px;
		border: 1px solid var(--line);
		border-radius: 4px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.unplayable .still {
		opacity: 0.5;
	}

	.unplayable h3 {
		color: var(--text-2);
	}

	@media (prefers-reduced-motion: reduce) {
		.still,
		.play,
		img {
			transition: none;
		}

		a.episode:hover .still {
			transform: none;
		}
	}
</style>
