<script lang="ts" module>
	import type { AnimeSeason } from "@sora/sdk";

	const chosen = $state<{
		season?: AnimeSeason;
	}>({});
</script>

<script lang="ts">
	import Catalog from "$lib/components/Catalog.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Sheet from "$lib/components/ui/Sheet.svelte";
	import { CaretDownIcon } from "phosphor-svelte";

	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();

	let seasonsOpen = $state(false);

	const label = (option: AnimeSeason) =>
		`${option.season.charAt(0)}${option.season.slice(1).toLowerCase()} ${option.year}`;

	const same = (left: AnimeSeason, right: AnimeSeason) =>
		left.season === right.season && left.year === right.year;

	const key = (option: AnimeSeason) => `${option.season}:${option.year}`;

	const selected = $derived(
		data.seasons.find((option) => chosen.season && same(option, chosen.season)) ?? data.current,
	);
</script>

<svelte:head>
	<title>{label(selected)} Simulcast Season · Sora</title>
</svelte:head>

{#key key(selected)}
	<Catalog
		title="Simulcast Season"
		empty={{
			title: `${label(selected)} came up empty.`,
			hint: "Try another season, there's plenty more airing.",
		}}
		request={{
			kind: "simulcast",
			season: selected.season,
			year: selected.year,
		}}
	>
		{#snippet controls()}
			<Button
				variant="ghost"
				class="min-h-11 gap-2 px-0 tracking-normal hover:bg-transparent hover:text-muted sm:hidden"
				aria-label="Choose simulcast season, {label(selected)} selected"
				aria-haspopup="dialog"
				aria-controls="season-list"
				onclick={() => (seasonsOpen = true)}
			>
				<CaretDownIcon size="0.875rem" weight="fill" />
				{label(selected)}
			</Button>
			<div class="hidden sm:block">
				<Dropdown
					variant="toolbar"
					class="max-h-80 min-w-48 overflow-y-auto"
					label="Choose simulcast season, {label(selected)} selected"
				>
					{#snippet trigger()}
						<CaretDownIcon size="0.875rem" weight="fill" />
						{label(selected)}
					{/snippet}

					{#snippet children()}
						<div role="menu" aria-label="Simulcast seasons">
							{#each data.seasons as option (key(option))}
								<Button
									role="menuitemradio"
									aria-checked={same(option, selected)}
									onclick={() => (chosen.season = option)}
									variant="item"
								>
									{label(option)}
								</Button>
							{/each}
						</div>
					{/snippet}
				</Dropdown>
			</div>
		{/snippet}
	</Catalog>
{/key}

<Sheet bind:open={seasonsOpen} id="season-list" title="Season List">
	{#each data.seasons as option (key(option))}
		<Button
			variant="item"
			aria-current={same(option, selected) ? "true" : undefined}
			class="aria-[current=true]:font-normal aria-[current=true]:text-foreground"
			onclick={() => {
				seasonsOpen = false;
				chosen.season = option;
			}}
		>
			{label(option)}
		</Button>
	{/each}
</Sheet>
