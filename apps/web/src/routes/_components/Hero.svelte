<script lang="ts">
	import type { ContinueWatchingItem, Series } from '@sora/sdk';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Skeleton from '$lib/components/snippets/Skeleton.svelte';
	import { formatEpisode, formatScore } from '$lib/utils';

	type Props = {
		featured: Series[] | undefined;
		resume: ContinueWatchingItem[] | undefined;
	};

	let { featured, resume }: Props = $props();

	let current = $state(0);
	let held = $state(false);

	function play(series: Series) {
		const item = resume?.find((entry) => entry.series.id === series.id);
		if (item) {
			const season = series.seasons.find((candidate) => candidate.id === item.season_id);
			return {
				href: `/series/${series.id}/watch/${item.season_id}/${item.episode}`,
				label: `${item.position_seconds > 0 ? 'Continue' : 'Watch'} ${formatEpisode(season, item.episode)}`
			};
		}

		const first = series.seasons.find((season) => season.in_watch_order) ?? series.seasons[0];
		return first
			? { href: `/series/${series.id}/watch/${first.id}/1`, label: 'Watch now' }
			: { href: `/series/${series.id}`, label: 'Watch now' };
	}

	function go(index: number) {
		if (featured?.length) {
			current = (index + featured.length) % featured.length;
		}
	}
</script>

{#if featured === undefined}
	<section class="hero" aria-busy="true" aria-label="Loading featured">
		<div class="content">
			<Skeleton width="min(420px, 70vw)" height="96px" />
			<Skeleton variant="text" width="220px" />
			<div class="lines">
				<Skeleton variant="text" width="100%" />
				<Skeleton variant="text" width="90%" />
				<Skeleton variant="text" width="60%" />
			</div>
			<Skeleton width="180px" height="48px" />
		</div>
	</section>
{:else if featured.length > 0}
	<section
		class="hero"
		class:held
		aria-roledescription="carousel"
		aria-label="Featured"
		onpointerenter={() => (held = true)}
		onpointerleave={() => (held = false)}
		onfocusin={() => (held = true)}
		onfocusout={() => (held = false)}
	>
		{#each featured as series, index (series.id)}
			{@const action = play(series)}
			<div
				class="slide"
				class:active={index === current}
				role="group"
				aria-roledescription="slide"
				aria-label="{index + 1} of {featured.length}: {series.title}"
				inert={index !== current}
			>
				<img
					class="backdrop"
					src={series.backdrop_url}
					alt=""
					decoding="async"
					fetchpriority={index === 0 ? 'high' : 'low'}
				/>

				<div class="content">
					{#if series.logo_url}
						<img class="logo" src={series.logo_url} alt={series.title} decoding="async" />
					{:else}
						<h2 class="title">{series.title}</h2>
					{/if}

					<div class="meta">
						<span class="live">Airing now</span>
						{#if series.score}
							<span class="score">
								<Icon name="star" size="xs" />
								{formatScore(series.score)}
							</span>
						{/if}
						{#if series.year}
							<span>{series.year}</span>
						{/if}
						{#each series.genres.slice(0, 3) as genre (genre)}
							<span>{genre}</span>
						{/each}
					</div>

					{#if series.overview}
						<p>{series.overview}</p>
					{/if}

					<div class="actions">
						<Button variant="primary" href={action.href}>
							<Icon name="play" />
							{action.label}
						</Button>
						<Button variant="secondary" href="/series/{series.id}">
							<Icon name="info" />
							More info
						</Button>
					</div>
				</div>
			</div>
		{/each}

		{#if featured.length > 1}
			<div class="pager" role="tablist" aria-label="Featured titles">
				{#each featured as series, index (series.id)}
					<button
						role="tab"
						aria-selected={index === current}
						aria-label={series.title}
						onclick={() => go(index)}
					>
						{#if index === current}
							<span class="fill" onanimationend={() => go(current + 1)}></span>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</section>
{/if}

<style>
	.hero {
		--duration: 9s;
		position: relative;
		height: clamp(560px, 86svh, 900px);
		overflow: hidden;
		background: var(--surface);
	}

	.hero[aria-busy='true'] {
		display: flex;
		align-items: flex-end;
		background: var(--bg);
	}

	.slide {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: flex-end;
		opacity: 0;
		visibility: hidden;
		transition:
			opacity 900ms var(--ease),
			visibility 900ms;
	}

	.slide.active {
		opacity: 1;
		visibility: visible;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center 20%;
		transform: scale(1.06);
		transition: transform var(--duration) linear;
	}

	.active .backdrop {
		transform: scale(1);
	}

	.slide::after {
		content: '';
		position: absolute;
		inset: 0;
		background:
			linear-gradient(0deg, var(--bg) 0%, rgb(9 9 11 / 0.6) 22%, transparent 55%),
			linear-gradient(90deg, rgb(9 9 11 / 0.9) 0%, rgb(9 9 11 / 0.55) 32%, transparent 62%);
	}

	.content {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 20px;
		box-sizing: border-box;
		width: min(640px, 100%);
		padding: 0 var(--gutter) clamp(96px, 14svh, 150px);
	}

	.slide .content > * {
		opacity: 0;
		transform: translateY(12px);
		transition:
			opacity 600ms var(--ease),
			transform 600ms var(--ease);
	}

	.slide.active .content > * {
		opacity: 1;
		transform: none;
	}

	.slide.active .content > :nth-child(2) {
		transition-delay: 80ms;
	}

	.slide.active .content > :nth-child(3) {
		transition-delay: 140ms;
	}

	.slide.active .content > :nth-child(4) {
		transition-delay: 200ms;
	}

	.logo {
		display: block;
		max-width: min(440px, 80%);
		max-height: 160px;
		object-fit: contain;
		object-position: left bottom;
		filter: drop-shadow(0 4px 24px rgb(0 0 0 / 0.5));
	}

	.title {
		margin: 0;
		font-size: clamp(36px, 5vw, 64px);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1;
		text-wrap: balance;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 14px;
		color: rgb(244 244 245 / 0.8);
		font-size: 14px;
		font-weight: 500;
	}

	.live {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		color: var(--text);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.live::before {
		content: '';
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 0 4px rgb(124 156 255 / 0.25);
	}

	.score {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--text);
	}

	.score :global(svg) {
		color: #facc15;
	}

	p {
		display: -webkit-box;
		margin: 0;
		overflow: hidden;
		color: rgb(244 244 245 / 0.82);
		font-size: 16px;
		line-height: 1.6;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 4px;
	}

	.lines {
		display: grid;
		gap: 10px;
		width: 100%;
	}

	.pager {
		position: absolute;
		right: var(--gutter);
		bottom: clamp(104px, 15svh, 158px);
		z-index: 2;
		display: flex;
		gap: 6px;
	}

	.pager button {
		position: relative;
		width: 36px;
		height: 20px;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
	}

	.pager button::before {
		content: '';
		position: absolute;
		inset: 8px 0;
		border-radius: 2px;
		background: rgb(255 255 255 / 0.28);
		transition: background-color 160ms var(--ease);
	}

	.pager button:hover::before {
		background: rgb(255 255 255 / 0.5);
	}

	.pager button:focus-visible {
		outline: 2px solid var(--text);
		outline-offset: 2px;
	}

	.fill {
		position: absolute;
		inset: 8px 0;
		border-radius: 2px;
		background: var(--text);
		transform-origin: left;
		animation: fill var(--duration) linear forwards;
	}

	.held .fill {
		animation-play-state: paused;
	}

	@keyframes fill {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}

	@media (max-width: 640px) {
		.slide::after {
			background: linear-gradient(0deg, var(--bg) 0%, rgb(9 9 11 / 0.75) 45%, rgb(9 9 11 / 0.1) 80%);
		}

		.pager {
			right: auto;
			left: var(--gutter);
			bottom: 48px;
		}

		p {
			-webkit-line-clamp: 2;
			line-clamp: 2;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.backdrop,
		.slide,
		.slide .content > * {
			transition: none;
		}

		.fill {
			animation: none;
			transform: none;
		}
	}
</style>
