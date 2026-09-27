<script lang="ts">
	import type { Series } from "@sora/sdk";
	import Icon, { paths } from "$lib/components/ui/Icon.svelte";

	type Props = {
		series: Series;
	};

	let {
		series,
	}: Props = $props();

	const id = $props.id();
	const stats = $derived.by(() => {
		const stats: {
			kind: "released" | "episodes";
			value: string;
			label: string;
		}[] = [];
		const episodes = series.seasons
			.filter((season) => season.kind === "season")
			.reduce((total, season) => total + season.episode_count, 0);

		if (series.start_date) {
			const parts = series.start_date.split("-").length;
			stats.push({
				kind: "released",
				value:
					parts === 1
						? series.start_date
						: new Date(series.start_date).toLocaleDateString("en-GB", {
								day: parts === 3 ? "numeric" : undefined,
								month: "long",
								year: "numeric",
								timeZone: "UTC",
							}),
				label: "Released",
			});
		}

		if (series.kind !== "movie" && episodes > 0) {
			stats.push({
				kind: "episodes",
				value: `${episodes.toLocaleString("en-GB")} ${episodes === 1 ? "episode" : "episodes"}`,
				label: episodes === 1 ? "Episode" : "Episodes",
			});
		}

		return stats;
	});

	const rating = $derived.by(() => {
		if (!series.score) {
			return undefined;
		}

		const stars = Math.round(series.score / 10) / 2;
		return {
			stars,
			label: `Average rating on AniList: ${stars.toLocaleString("en-GB")} of 5 stars (${series.score}%)`,
		};
	});
</script>

{#if stats.length || rating}
	<ul>
		{#each stats as stat (stat.kind)}
			<li>
				<Icon name={stat.kind === "released" ? "calendar" : "tv"} size="sm" />
				<span class="label">{stat.label}:</span>
				{stat.value}
			</li>
		{/each}

		{#if rating}
			<li>
				<svg
					class="stars"
					viewBox="0 0 120 24"
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<clipPath id="{id}-rating">
						<rect width={rating.stars * 24} height="24" />
					</clipPath>

					{#each ["none", "currentColor"] as fill, layer (layer)}
						<g
							{fill}
							clip-path={layer ? `url(#${id}-rating)` : undefined}
						>
							{#each { length: 5 }, index (index)}
								<path
									transform="translate({index * 24} 0)"
									d={paths.star}
								/>
							{/each}
						</g>
					{/each}
				</svg>
				<span class="label">{rating.label}</span>
			</li>
		{/if}
	</ul>
{/if}

<style>
	ul {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 24px;
		margin: 0;
		padding: 0;
		color: #ddd;
		font-size: 15px;
		list-style: none;
	}

	li {
		display: flex;
		align-items: center;
		gap: 8px;
		white-space: nowrap;
	}

	.stars {
		flex: none;
		width: 80px;
		height: 16px;
		color: #fff;
	}

	.label {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
