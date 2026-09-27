<script lang="ts">
	import type { EpisodeProgress, SeasonEpisode } from "@sora/sdk";
	import Button from "$lib/components/ui/Button.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import { tmdbImage, tmdbSrcset } from "$lib/utils";
	import { markWatched } from "../series.remote";

	type Props = {
		seriesId: string;
		seasonId: string;
		episode: SeasonEpisode;
		now: Date;
		checkpoint: EpisodeProgress | undefined;
	};

	let { seriesId, seasonId, episode, now, checkpoint }: Props = $props();

	let marking = $state(false);

	const watched = $derived(checkpoint?.completed ?? false);
	const played = $derived(
		checkpoint && !checkpoint.completed && checkpoint.position_seconds > 0
			? checkpoint.position_seconds / checkpoint.duration_seconds
			: 0,
	);

	async function mark() {
		marking = true;
		try {
			await markWatched({
				seriesId,
				seasonId,
				episode: episode.number,
				duration:
					checkpoint?.duration_seconds ?? (episode.runtime_minutes ?? 24) * 60,
				watched: !watched,
			});
		} finally {
			marking = false;
		}
	}

	const playable = $derived(!episode.extra && episode.audio?.length !== 0);
	const ends = $derived(
		episode.runtime_minutes
			? new Date(
					now.getTime() + episode.runtime_minutes * 60_000,
				).toLocaleTimeString("en-GB", {
					hour: "2-digit",
					minute: "2-digit",
				})
			: undefined,
	);
</script>

<li class:watched>
	<svelte:element
		this={playable ? "a" : "div"}
		class="episode"
		href={playable
			? `/series/${seriesId}/watch/${seasonId}/${episode.number}`
			: undefined}
	>
		<div class="still">
			{#if episode.still_url}
				<img
					src={tmdbImage(episode.still_url, "w780")}
					srcset={tmdbSrcset(episode.still_url, {
						w300: 300,
						w780: 780,
					})}
					sizes="30vw"
					alt={episode.title}
					loading="lazy"
					decoding="async"
				/>
			{/if}
			{#if played}
				<span class="progress">
					<span style:width="{played * 100}%"></span>
				</span>
			{/if}
		</div>

		<div class="text">
			<h3>
				{episode.number}. {episode.title ?? `Episode ${episode.number}`}
			</h3>
			<div class="meta">
				{#if episode.runtime_minutes}
					<span>{episode.runtime_minutes}m</span>
					<span>Ends at {ends}</span>
				{/if}
				{#if episode.air_date}
					<span
						>{new Date(episode.air_date).toLocaleDateString("en-GB", {
							day: "numeric",
							month: "long",
							year: "numeric",
							timeZone: "UTC",
						})}</span
					>
				{/if}
				{#each episode.audio ?? [] as audio (audio)}
					<span class="badge">{audio}</span>
				{/each}
				{#if episode.filler}
					<span class="badge">Filler</span>
				{/if}
			</div>
			{#if episode.overview}
				<p>{episode.overview}</p>
			{/if}
		</div>
	</svelte:element>

	{#if !episode.extra}
		<Button
			class="mark"
			aria-pressed={watched}
			aria-label={watched ? "Mark as unwatched" : "Mark as watched"}
			disabled={marking}
			onclick={mark}
		>
			<Icon name="check" />
		</Button>
	{/if}
</li>

<style>
	li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 40px;
		align-items: center;
		gap: 16px;
		padding-right: 16px;
		transition: background 120ms;
		content-visibility: auto;
		contain-intrinsic-size: auto 230px;
	}

	li:has(> a.episode):hover {
		background: rgb(255 255 255 / 0.05);
	}

	li:has(> a.episode:focus-visible) {
		outline: 2px solid #fff;
	}

	.episode {
		display: grid;
		grid-template-columns: minmax(160px, 3fr) minmax(0, 5fr);
		align-items: center;
		gap: 24px;
		color: inherit;
		text-decoration: none;
	}

	a.episode:focus-visible {
		outline: none;
	}

	.still {
		display: grid;
		align-self: stretch;
		aspect-ratio: 3 / 2;
		background: #2a2a2a;
		overflow: hidden;
	}

	.still > * {
		grid-area: 1 / 1;
	}

	.still img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.watched .still img {
		opacity: 0.5;
	}

	.progress {
		align-self: end;
		height: 4px;
		background: rgb(0 0 0 / 0.6);
	}

	.progress span {
		display: block;
		height: 100%;
		background: var(--accent);
	}

	li :global(.mark) {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		color: #ddd;
	}

	li :global(.mark:hover) {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	li :global(.mark[aria-pressed="true"]) {
		color: var(--accent);
	}

	.text {
		padding: 12px 0;
	}

	h3 {
		margin: 0 0 8px;
		font-size: 16px;
		font-weight: 400;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 8px;
		margin-bottom: 10px;
		color: #999;
		font-size: 14px;
	}

	.meta:empty {
		display: none;
	}

	.meta span:not(.badge) + span:not(.badge)::before {
		content: "";
		display: inline-block;
		width: 4px;
		height: 4px;
		margin-right: 8px;
		background: currentColor;
		vertical-align: middle;
		rotate: 45deg;
	}

	.badge {
		padding: 2px 6px;
		background: rgb(255 255 255 / 0.06);
		color: #aaa;
		font-size: 11px;
		letter-spacing: 0.04em;
		line-height: 1.3;
		text-transform: uppercase;
	}

	.meta span:not(.badge) + .badge {
		margin-left: 4px;
	}

	p {
		margin: 0;
		color: #999;
		font-size: 15px;
		line-height: 1.55;
	}
</style>
