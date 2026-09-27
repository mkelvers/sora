<script lang="ts">
	import type { Season } from "@sora/sdk";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";

	type Props = {
		seasons: Season[];
		season: Season;
	};

	let { seasons, season = $bindable() }: Props = $props();
</script>

<div class="seasons">
	<Dropdown id="seasons" class="menu" role="menu" aria-label="Seasons">
		{#snippet trigger()}
			{season.title}
			<Icon name="expand" size="sm" />
		{/snippet}

		{#each seasons as other (other.id)}
			{@const checked = other.id === season.id}
			<Button
				role="menuitemradio"
				aria-checked={checked}
				popovertarget="seasons"
				popovertargetaction="hide"
				onclick={() => (season = other)}
			>
				<span class="check">
					{#if checked}
						<Icon name="check" size="sm" />
					{/if}
				</span>
				<span class="title">{other.title}</span>
				<span class="count">{other.episode_count}</span>
			</Button>
		{/each}
	</Dropdown>
</div>

<style>
	.seasons {
		min-width: 0;
	}

	.seasons :global(.dropdown-trigger) {
		max-width: 100%;
		padding: 7px 8px 7px 12px;
		background: rgb(255 255 255 / 0.06);
		color: #e6e6e6;
		font-size: 15px;
	}

	.seasons :global(.dropdown-trigger:hover),
	.seasons:has(:popover-open) :global(.dropdown-trigger) {
		background: rgb(255 255 255 / 0.1);
	}

	.seasons :global(.dropdown-trigger svg) {
		color: #999;
	}

	.seasons :global(.menu) {
		max-width: min(420px, calc(100vw - 32px));
		max-height: min(60vh, 480px);
		overflow: hidden auto;
	}

	.check {
		display: inline-grid;
		flex: none;
		place-items: center;
		width: 16px;
		height: 16px;
	}

	.title {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.count {
		margin-left: auto;
		padding-left: 16px;
		color: #666;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}
</style>
