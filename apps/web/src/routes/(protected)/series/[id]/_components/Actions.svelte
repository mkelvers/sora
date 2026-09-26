<script lang="ts">
	import type { Series } from "@sora/sdk";
	import { goto } from "$app/navigation";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import { shuffleEpisode } from "../series.remote";

	type Props = {
		series: Series;
	};

	let { series }: Props = $props();

	const first = $derived(
		series.seasons.find((season) => season.in_watch_order) ?? series.seasons[0],
	);

	let shuffling = $state(false);
	let copied = $state(false);

	async function shuffle() {
		shuffling = true;
		try {
			const episode = await shuffleEpisode(series.id);
			await goto(`/series/${series.id}/watch/${episode.seasonId}/${episode.number}`);
		} finally {
			shuffling = false;
		}
	}

	async function copyLink() {
		await navigator.clipboard.writeText(`${location.origin}/series/${series.id}`);
		copied = true;
		setTimeout(() => {
			copied = false;
			document.getElementById("series-actions")?.hidePopover();
		}, 1200);
	}
</script>

<div class="actions">
	{#if first}
		<a
			class="action"
			href="/series/{series.id}/watch/{first.id}/1"
			aria-label="Play from the beginning"
			title="Play from the beginning"
		>
			<Icon name="play" />
		</a>
	{/if}

	<Button
		class="action"
		aria-label="Play a random episode"
		title="Play a random episode"
		disabled={shuffling}
		onclick={shuffle}
	>
		<Icon name="shuffle" />
	</Button>

	<Dropdown id="series-actions" label="More" role="menu" aria-label="More">
		{#snippet trigger()}
			<Icon name="more" />
		{/snippet}

		<a role="menuitem" href="/series/{series.id}/artwork">
			<Icon name="edit" size="sm" />
			Edit artwork
		</a>
		<Button role="menuitem" onclick={copyLink}>
			<Icon name={copied ? "check" : "link"} size="sm" />
			{copied ? "Link copied" : "Copy link"}
		</Button>
	</Dropdown>
</div>

<style>
	.actions {
		display: flex;
		flex: none;
		align-items: center;
		gap: 4px;
	}

	.actions :global(.action),
	.actions :global(.dropdown-trigger) {
		display: inline-grid;
		place-items: center;
		width: 40px;
		height: 40px;
		padding: 0;
		border-radius: 50%;
		color: #ddd;
		transition:
			background 120ms,
			color 120ms;
	}

	.actions :global(.action:hover),
	.actions :global(.dropdown-trigger:hover),
	.actions:has(:popover-open) :global(.dropdown-trigger) {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	.actions :global(.action:focus-visible) {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.actions :global(.dropdown-menu a),
	.actions :global(.dropdown-menu .button) {
		display: flex;
		align-items: center;
		gap: 12px;
		color: inherit;
		text-decoration: none;
	}

	.actions :global(.dropdown-menu a:hover),
	.actions :global(.dropdown-menu a:focus-visible) {
		background: rgb(255 255 255 / 0.08);
		color: #fff;
		outline: none;
	}
</style>
