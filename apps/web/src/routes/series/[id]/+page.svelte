<script lang="ts">
	import About from './_components/About.svelte';
	import Episodes from './_components/Episodes.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Poster from '$lib/components/snippets/Poster.svelte';
	import Shelf from '$lib/components/snippets/Shelf.svelte';
	import { formatEpisode, formatScore } from '$lib/utils';
	import { getProgress, getResume, getSeries } from './series.remote';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	const series = $derived(await getSeries(params.id));
	const resume = $derived(await getResume(params.id));
	const progress = $derived(getProgress(params.id));

	/** Opens on the season being watched. */
	let season = $derived(
		series.seasons.find((candidate) => candidate.id === resume?.season_id) ?? series.seasons[0]
	);

	const statuses = {
		RELEASING: 'Airing',
		FINISHED: 'Finished',
		NOT_YET_RELEASED: 'Upcoming',
		HIATUS: 'On hiatus',
		CANCELLED: 'Cancelled'
	};

	const seasonCount = $derived(series.seasons.filter((candidate) => candidate.kind === 'season').length);

	/** Play: where the profile left off, or from the start of the story. */
	const play = $derived.by(() => {
		if (resume) {
			const at = series.seasons.find((candidate) => candidate.id === resume.season_id);
			const started = resume.position_seconds > 0;
			const played = started && resume.duration_seconds ? resume.position_seconds / resume.duration_seconds : 0;
			return {
				href: `/series/${series.id}/watch/${resume.season_id}/${resume.episode}`,
				label: at?.kind === 'movie' ? (started ? 'Continue' : 'Play') : `${started ? 'Continue' : 'Watch'} ${formatEpisode(at, resume.episode)}`,
				played,
				left:
					played > 0 && resume.duration_seconds
						? Math.max(1, Math.round((resume.duration_seconds - resume.position_seconds) / 60))
						: undefined
			};
		}

		const first = series.seasons.find((candidate) => candidate.in_watch_order) ?? series.seasons[0];
		if (!first) return undefined;
		return {
			href: `/series/${series.id}/watch/${first.id}/1`,
			label: first.kind === 'movie' ? 'Play' : `Start watching ${formatEpisode(first, 1)}`,
			played: 0,
			left: undefined
		};
	});
</script>

<svelte:head>
	<title>{series.title}</title>
</svelte:head>

<header>
	{#if series.backdrop_url}
		<img class="backdrop" src={series.backdrop_url} alt="" fetchpriority="high" decoding="async" />
	{/if}

	<div class="content">
		<h1>
			{#if series.logo_url}
				<img class="logo" src={series.logo_url} alt={series.title} decoding="async" />
			{:else}
				{series.title}
			{/if}
		</h1>

		<div class="meta">
			{#if series.score}
				<span class="score">
					<Icon name="star" size="xs" />
					{formatScore(series.score)}
				</span>
			{/if}
			{#if series.year}
				<span>{series.year}</span>
			{/if}
			{#if series.status}
				<span class:airing={series.status === 'RELEASING'}>{statuses[series.status]}</span>
			{/if}
			{#if seasonCount > 1}
				<span>{seasonCount} seasons</span>
			{/if}
			{#each series.genres.slice(0, 3) as genre (genre)}
				<span>{genre}</span>
			{/each}
		</div>

		<div class="actions">
			{#if play}
				<div class="play">
					<Button variant="primary" href={play.href}>
						<Icon name="play" />
						{play.label}
					</Button>
					{#if play.left}
						<div class="progress">
							<span class="bar" style:--played={play.played}></span>
							{play.left} min left
						</div>
					{/if}
				</div>
			{/if}

			<Button
				variant="secondary"
				class="square"
				href="/series/{series.id}/artwork"
				aria-label="Edit artwork"
				title="Edit artwork"
			>
				<Icon name="edit" size="md" />
			</Button>
		</div>
	</div>
</header>

<main>
	<About {series} />

	{#if season}
		<Episodes {series} bind:season progress={progress.current} />
	{/if}

	{#if series.related.length > 0}
		<Shelf title="Related" items={series.related} key={(related) => related.id}>
			{#snippet item(related)}
				<Poster series={related} />
			{/snippet}
		</Shelf>
	{/if}
</main>

<style>
	header {
		position: relative;
		display: flex;
		align-items: flex-end;
		min-height: clamp(520px, 78svh, 820px);
		overflow: hidden;
		background: var(--surface);
	}

	.backdrop {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center 20%;
		animation: settle 1.4s var(--ease) both;
	}

	header::after {
		content: '';
		position: absolute;
		inset: 0;
		background:
			linear-gradient(0deg, var(--bg) 0%, rgb(9 9 11 / 0.55) 25%, transparent 60%),
			linear-gradient(90deg, rgb(9 9 11 / 0.92) 0%, rgb(9 9 11 / 0.6) 30%, transparent 65%);
	}

	.content {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 20px;
		box-sizing: border-box;
		width: min(680px, 100%);
		padding: calc(var(--nav) + 48px) var(--gutter) 56px;
		animation: rise 700ms 120ms var(--ease) both;
	}

	h1 {
		margin: 0;
		font-size: clamp(36px, 5vw, 60px);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1.02;
		text-wrap: balance;
	}

	.logo {
		display: block;
		max-width: min(460px, 80vw);
		max-height: 180px;
		object-fit: contain;
		object-position: left bottom;
		filter: drop-shadow(0 4px 24px rgb(0 0 0 / 0.5));
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 0;
		color: rgb(244 244 245 / 0.78);
		font-size: 14px;
		font-weight: 500;
	}

	.meta span + span::before {
		content: '';
		display: inline-block;
		width: 3px;
		height: 3px;
		margin: 0 10px;
		border-radius: 50%;
		background: currentColor;
		opacity: 0.6;
		vertical-align: middle;
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

	.airing {
		color: var(--accent);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 12px;
		margin-top: 8px;
	}

	.play {
		display: grid;
		gap: 10px;
	}

	.progress {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--text-2);
		font-size: 12px;
		font-weight: 500;
	}

	.bar {
		position: relative;
		flex: 1;
		height: 3px;
		border-radius: 2px;
		background: rgb(255 255 255 / 0.2);
		overflow: hidden;
	}

	.bar::after {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: calc(var(--played) * 100%);
		background: var(--accent);
	}

	.actions :global(.square) {
		width: 48px;
		padding: 0;
	}

	main {
		display: flex;
		flex-direction: column;
		gap: 64px;
		padding-bottom: 96px;
	}

	@keyframes settle {
		from {
			opacity: 0;
			transform: scale(1.04);
		}
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
	}

	@media (max-width: 640px) {
		header::after {
			background: linear-gradient(0deg, var(--bg) 0%, rgb(9 9 11 / 0.75) 45%, rgb(9 9 11 / 0.1) 85%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.backdrop,
		.content {
			animation: none;
		}
	}
</style>
