<script lang="ts">
	import type { WatchlistItem } from "@sora/sdk";
	import Poster from "$lib/components/Poster.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";

	let {
		item,
		ondrop,
		onunlist,
	}: {
		item: WatchlistItem;
		ondrop: (dropped: boolean) => void;
		onunlist: () => void;
	} = $props();

	const current = $derived(item.current_season);
	const share = $derived(
		current && current.released_episodes > 0
			? current.watched_episodes / current.released_episodes
			: 0,
	);
</script>

<li class="item">
	<Poster card={item.series} />

	<div class="state">
		<p class={["status", item.status]}>
			{#if item.status === "watching" && current}
				<span>
					{item.series.season_count > 1 ? `${current.title} · ` : ""}{current.watched_episodes}/{current.released_episodes}
				</span>
			{:else if item.status === "completed"}
				<span>Watched</span>
				{#if item.new_season}
					<span class="new">{item.new_season.title} is out</span>
				{/if}
			{:else if item.status === "dropped"}
				<span>Dropped</span>
			{:else}
				<span>Not started</span>
			{/if}
		</p>

		<Dropdown
			id="item-{item.series.id}"
			label="More"
			role="menu"
			aria-label="More"
			class="menu"
		>
			{#snippet trigger()}
				<Icon name="more" size="sm" />
			{/snippet}

			<Button
				role="menuitem"
				popovertarget="item-{item.series.id}"
				popovertargetaction="hide"
				onclick={() => ondrop(item.status !== "dropped")}
			>
				<Icon
					name={item.status === "dropped" ? "restore" : "close"}
					size="sm"
				/>
				{item.status === "dropped" ? "Undo drop" : "Drop"}
			</Button>
			<Button
				role="menuitem"
				popovertarget="item-{item.series.id}"
				popovertargetaction="hide"
				onclick={onunlist}
			>
				<Icon name="delete" size="sm" />
				Remove from Watchlist
			</Button>
		</Dropdown>
	</div>

	{#if item.status === "watching"}
		<div
			class="bar"
			role="progressbar"
			aria-label="Episodes watched"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(share * 100)}
		>
			<span style:width="{share * 100}%"></span>
		</div>
	{/if}
</li>

<style>
	.item {
		display: grid;
		grid-template-rows: 1fr auto auto;
		gap: 6px;
		min-width: 0;
	}

	.state {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 32px;
	}

	.status {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 8px;
		min-width: 0;
		margin: 0;
		color: #999;
		font-size: 13px;
	}

	.status.watching {
		color: #ddd;
	}

	.status.dropped {
		color: #777;
	}

	.new {
		color: var(--accent);
	}

	.state :global(.dropdown-trigger) {
		padding: 6px;
	}

	.state :global(.menu .button) {
		gap: 12px;
	}

	.bar {
		height: 3px;
		background: #333;
	}

	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
	}
</style>
