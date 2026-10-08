<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Tooltip from "$lib/components/ui/Tooltip.svelte";
	import { getLibrary, statuses } from "$routes/(app)/library.svelte";
	import type { SeriesCard } from "@sora/sdk";
	import { BookmarkSimpleIcon, PencilSimpleIcon } from "phosphor-svelte";

	let {
		series,
	}: {
		series: SeriesCard;
	} = $props();

	const library = getLibrary();
	const status = $derived(library.status.get(series.id) ?? null);
	const statusLabel = $derived(statuses.find((option) => option.value === status)?.label);
</script>

<Tooltip text={status ? "Remove from Watchlist" : "Add to Watchlist"}>
	{#snippet children(anchor)}
		<Button
			{...anchor}
			variant="secondary"
			square
			aria-label={status ? "Remove from Watchlist" : "Add to Watchlist"}
			aria-pressed={!!status}
			onclick={() => library.toggle(series)}
		>
			<BookmarkSimpleIcon size="1.5rem" weight={status ? "fill" : "bold"} />
		</Button>
	{/snippet}
</Tooltip>

<Tooltip text="Change Watchlist Status">
	{#snippet children(anchor)}
		<div
			{...anchor}
			onfocus={undefined}
			onblur={undefined}
			onfocusin={(event) => {
				if ((event.target as HTMLElement).matches("[aria-expanded]")) {
					anchor.onfocus();
				}
			}}
			onfocusout={anchor.onblur}
		>
			<Dropdown
				variant="secondary"
				square
				alignment="left"
				label={statusLabel ? `${statusLabel}, Change Watchlist Status` : "Change Watchlist Status"}
			>
				{#snippet trigger()}
					<PencilSimpleIcon size="1.5rem" weight="bold" />
				{/snippet}

				{#snippet children()}
					<div role="menu" aria-label="Watchlist Status">
						{#each statuses as option (option.value)}
							<Button
								role="menuitemradio"
								aria-checked={option.value === status}
								variant="item"
								onclick={() => library.set(series, option.value)}
							>
								{option.label}
							</Button>
						{/each}
						{#if status}
							<Button
								role="menuitem"
								variant="item"
								tone="danger"
								onclick={() => library.set(series, null)}
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
