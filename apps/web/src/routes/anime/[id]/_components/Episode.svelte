<script lang="ts">
	import type { SeasonEpisode } from '@sora/sdk';

	type Props = {
		episode: SeasonEpisode;
		now: Date;
	};

	let { episode, now }: Props = $props();
</script>

<li>
	<div class="still">
		{#if episode.still_url}
			<img src={episode.still_url} alt="" loading="lazy" />
		{/if}
	</div>

	<div class="text">
		<h2>{episode.number}. {episode.title ?? `Episode ${episode.number}`}</h2>
		<div class="meta">
			{#if episode.runtime_minutes}
				<span>{episode.runtime_minutes}m</span>
				<span>
					Ends at {new Date(now.getTime() + episode.runtime_minutes * 60_000).toLocaleTimeString('en-GB', {
						hour: '2-digit',
						minute: '2-digit'
					})}
				</span>
			{/if}
			{#if episode.air_date}
				<span>
					{new Date(episode.air_date).toLocaleDateString('en-GB', {
						day: 'numeric',
						month: 'long',
						year: 'numeric',
						timeZone: 'UTC'
					})}
				</span>
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
</li>

<style>
	li {
		display: grid;
		grid-template-columns: minmax(160px, 375px) minmax(0, 1fr);
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
		content: '·';
		margin-right: 8px;
	}

	.badge {
		padding: 2px 6px;
		border-radius: 4px;
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
		font-size: 14px;
		line-height: 1.45;
	}

	@media (max-width: 720px) {
		li {
			grid-template-columns: 140px minmax(0, 1fr);
			gap: 12px;
		}
	}
</style>
