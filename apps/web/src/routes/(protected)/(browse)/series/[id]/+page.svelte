<script lang="ts">
	import Actions from "./_components/Actions.svelte";
	import Details from "./_components/Details.svelte";
	import Episodes from "./_components/Episodes.svelte";
	import Related from "./_components/Related.svelte";
	import Seasons from "./_components/Seasons.svelte";
	import Stats from "./_components/Stats.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import { tmdbSrcset } from "$lib/utils";
	import { getSeries } from "./series.remote";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const series = $derived(await getSeries(params.id));
	let season = $derived(series.seasons[0]);

	const next = $derived.by(() => {
		if (!series.next_episode) {
			return undefined;
		}

		const { number, airing_at } = series.next_episode;
		const airing = new Date(airing_at);
		const now = new Date();
		if (airing <= now) {
			return undefined;
		}

		const days = Math.round(
			(new Date(airing).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) /
				86_400_000,
		);
		const day =
			days < 2
				? new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(days, "day")
				: days < 7
					? `on ${airing.toLocaleDateString("en-GB", { weekday: "long" })}`
					: `on ${airing.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;

		return {
			number,
			airing_at,
			when: `${day} at ${airing.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
			date: airing.toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" }),
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

			<Actions {series} />
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
			{#if series.overview || next}
				<div class="about">
					{#if series.overview}
						<p class="overview">{series.overview}</p>
					{/if}

					{#if next}
						<p class="next">
							<Icon name="schedule" size="sm" />
							<span>
								Episode {next.number} airs
								<time datetime={next.airing_at} title={next.date}>{next.when}</time>
							</span>
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

	.next {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		color: #888;
		font-size: 14px;
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
