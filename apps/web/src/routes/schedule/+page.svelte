<script lang="ts">
	import Skeleton from '$lib/components/snippets/Skeleton.svelte';
	import { formatDay, formatTime } from '$lib/utils';
	import { getSchedule } from './schedule.remote';
	import type { ScheduledEpisode } from '@sora/sdk';

	const schedule = getSchedule();

	const days = $derived.by(() => {
		const groups = new Map<string, { date: Date; episodes: ScheduledEpisode[] }>();
		for (const episode of schedule.current ?? []) {
			const date = new Date(episode.airing_at);
			const key = date.toDateString();
			const group = groups.get(key) ?? { date, episodes: [] };
			group.episodes.push(episode);
			groups.set(key, group);
		}
		return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
	});

	function formatShortDate(date: Date) {
		return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
	}
</script>

<svelte:head>
	<title>Release calendar</title>
</svelte:head>

<main>
	<hgroup>
		<p>Next 7 days</p>
		<h1>Release calendar</h1>
	</hgroup>

	{#if schedule.error}
		<p class="note">Couldn't load the calendar. Try again.</p>
	{:else if !schedule.current}
		<div aria-busy="true" aria-label="Loading calendar">
			{#each { length: 6 }, index (index)}
				<div class="row">
					<Skeleton variant="text" width="48px" />
					<Skeleton width="56px" ratio="2 / 3" />
					<Skeleton variant="text" width="40%" />
				</div>
			{/each}
		</div>
	{:else if days.length === 0}
		<p class="note">Nothing airs in the next 7 days.</p>
	{:else}
		<nav aria-label="Days">
			{#each days as day (day.key)}
				<a href="#{day.key.replaceAll(' ', '-')}">
					<span>{formatDay(day.date)}</span>
					<small>{day.episodes.length}</small>
				</a>
			{/each}
		</nav>

		{#each days as day (day.key)}
			<section id={day.key.replaceAll(' ', '-')}>
				<h2>
					{formatDay(day.date)}
					<span>{formatShortDate(day.date)}</span>
				</h2>

				<ol>
					{#each day.episodes as entry (`${entry.season_id}/${entry.episode}`)}
						<li>
							<a class="row" href="/series/{entry.series.id}">
								<time datetime={entry.airing_at}>{formatTime(new Date(entry.airing_at))}</time>
								{#if entry.series.poster_url}
									<img src={entry.series.poster_url} alt="" loading="lazy" decoding="async" />
								{:else}
									<div class="thumb"></div>
								{/if}
								<div class="text">
									<span class="title">{entry.series.title}</span>
									<span class="episode">Episode {entry.episode}</span>
								</div>
							</a>
						</li>
					{/each}
				</ol>
			</section>
		{/each}
	{/if}
</main>

<style>
	main {
		max-width: 960px;
		padding: 32px clamp(16px, 3.3vw, 64px) 64px;
	}

	hgroup {
		margin-bottom: 24px;
	}

	hgroup p {
		margin: 0 0 4px;
		color: #999;
		font-size: 13px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		font-size: 32px;
		font-weight: 400;
	}

	.note {
		color: #999;
	}

	nav {
		display: flex;
		gap: 4px;
		margin-bottom: 16px;
		overflow-x: auto;
		scrollbar-width: none;
	}

	nav a {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		background: rgb(255 255 255 / 0.06);
		color: #ccc;
		font-size: 14px;
		text-decoration: none;
		white-space: nowrap;
	}

	nav a:hover {
		background: rgb(255 255 255 / 0.12);
		color: #fff;
	}

	nav small {
		color: #888;
		font-size: 12px;
	}

	section {
		/* Clears the sticky header when jumped to. */
		scroll-margin-top: 72px;
		margin-top: 32px;
	}

	h2 {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin: 0 0 8px;
		font-size: 20px;
		font-weight: 400;
	}

	h2 span {
		color: #888;
		font-size: 14px;
	}

	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: grid;
		grid-template-columns: 56px 56px 1fr;
		align-items: center;
		gap: 16px;
		padding: 8px;
		color: inherit;
		text-decoration: none;
	}

	a.row:hover {
		background: rgb(255 255 255 / 0.06);
	}

	a.row:focus-visible {
		outline: 2px solid #fff;
	}

	time {
		color: #bbb;
		font-size: 15px;
		font-variant-numeric: tabular-nums;
	}

	img,
	.thumb {
		display: block;
		width: 56px;
		aspect-ratio: 2 / 3;
		object-fit: cover;
		background: #2a2a2a;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.title {
		overflow: hidden;
		font-size: 16px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.episode {
		color: #999;
		font-size: 14px;
	}
</style>
