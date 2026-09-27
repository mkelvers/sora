<script lang="ts">
	import type { Series } from "@sora/sdk";

	type Props = {
		series: Series;
	};

	let { series }: Props = $props();

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
						: new Date(series.start_date).toLocaleDateString("da-DK", {
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
				value: `${episodes.toLocaleString("da-DK")} ${episodes === 1 ? "episode" : "episodes"}`,
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
			label: `Average rating on AniList: ${stars.toLocaleString("da-DK")} of 5 stars (${series.score}%)`,
		};
	});
</script>

{#if stats.length || rating}
	<ul>
		{#each stats as stat (stat.kind)}
			<li title={stat.label}>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					{#if stat.kind === "released"}
						<rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
						<path d="M3.5 10h17M8 3v4M16 3v4" />
						<path
							stroke-width="2"
							d="M8 14h.01M12 14h.01M16 14h.01M8 17.25h.01M12 17.25h.01"
						/>
					{:else}
						<rect x="2.5" y="7" width="19" height="13.5" rx="2.5" />
						<path d="M8 2.5l4 4.5 4-4.5" />
					{/if}
				</svg>
				<span class="label">{stat.label}:</span>
				{stat.value}
			</li>
		{/each}

		{#if rating}
			<li title={rating.label}>
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
									d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9-4.4-4.1 6-.8z"
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

	svg {
		flex: none;
		width: 17px;
		height: 17px;
		color: #fff;
	}

	.stars {
		width: 80px;
		height: 16px;
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
