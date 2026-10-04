<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Tooltip from "$lib/components/ui/Tooltip.svelte";
	import { getLibrary } from "$routes/(app)/library.svelte";
	import { setStatus, statusLabels } from "$routes/(app)/watchlist/watchlist";
	import type { SeriesCard, WatchlistStatus } from "@sora/sdk";
	import { BookmarkSimpleIcon } from "phosphor-svelte";

	let {
		series,
	}: {
		series: SeriesCard;
	} = $props();

	const library = getLibrary();
	const status = $derived(library.status.get(series.id) ?? null);
	const statuses = Object.keys(statusLabels) as WatchlistStatus[];
	const tooltip = $derived(status ? "Change Watchlist status" : "Add to Watchlist");
</script>

<Tooltip text={tooltip}>
	{#snippet children(anchor)}
		<div
			{...anchor}
			onfocus={undefined}
			onblur={undefined}
			onfocusin={(event) => {
				if ((event.target as HTMLElement).matches(".dropdown-trigger")) {
					anchor.onfocus();
				}
			}}
			onfocusout={anchor.onblur}
		>
			<Dropdown
				variant="outline"
				alignment="left"
				class="w-56"
				label={status ? `${statusLabels[status]}, change watchlist status` : "Add to Watchlist"}
			>
				{#snippet trigger()}
					<BookmarkSimpleIcon size="1.5rem" weight={status ? "fill" : "bold"} />
				{/snippet}

				{#snippet children()}
					<div role="menu" aria-label="Watchlist status">
						{#each statuses as option (option)}
							<Button
								role="menuitemradio"
								aria-checked={option === status}
								variant="item"
								onclick={() => setStatus(series, option)}
							>
								{statusLabels[option]}
							</Button>
						{/each}
						{#if status}
							<Button
								role="menuitem"
								variant="item"
								tone="danger"
								onclick={() => setStatus(series, null)}
							>
								Remove from Watchlist
							</Button>
						{/if}
					</div>
				{/snippet}
			</Dropdown>
		</div>
	{/snippet}
</Tooltip>
