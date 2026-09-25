<script lang="ts">
	import type { SeasonEpisode } from '@sora/sdk';

	type Props = {
		episode: SeasonEpisode;
	};

	let { episode }: Props = $props();
</script>

<li>
	<div class="still">
		{#if episode.still_url}
			<img src={episode.still_url} alt="" loading="lazy" />
		{/if}
	</div>

	<div class="text">
		<h2>{episode.number}. {episode.title ?? `Episode ${episode.number}`}</h2>
		<small>
			{#if episode.runtime_minutes}
				<span>{episode.runtime_minutes}m</span>
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
			{#if episode.audio?.length}
				<span class="audio">{episode.audio.join(', ')}</span>
			{/if}
			{#if episode.filler}
				<span>Filler</span>
			{/if}
		</small>
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

	span + span::before {
		content: '·';
		margin: 0 6px;
	}

	.audio {
		text-transform: capitalize;
	}

	@media (max-width: 720px) {
		li {
			grid-template-columns: 140px minmax(0, 1fr);
			gap: 12px;
		}
	}
</style>
