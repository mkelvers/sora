<script lang="ts">
	import Catalog from "$lib/components/Catalog.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import type { AnimeSeason } from "@sora/sdk";
	import { CaretDownIcon } from "phosphor-svelte";

	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();

	const label = (option: AnimeSeason) =>
		`${option.season.charAt(0)}${option.season.slice(1).toLowerCase()} ${option.year}`;

	const same = (left: AnimeSeason, right: AnimeSeason) =>
		left.season === right.season && left.year === right.year;

	const href = (option: AnimeSeason) =>
		same(option, data.current)
			? "/simulcast"
			: `/simulcast?season=${option.season.toLowerCase()}&year=${option.year}`;
</script>

<svelte:head>
	<title>{label(data.selected)} Simulcast Season · Sora</title>
</svelte:head>

{#key href(data.selected)}
	<Catalog
		title="Simulcast Season"
		empty="We couldn’t find any releases for {label(data.selected)}."
		request={{
			kind: "simulcast",
			season: data.selected.season,
			year: data.selected.year,
		}}
	>
		{#snippet controls()}
			<Dropdown
				variant="toolbar"
				class="max-h-80 min-w-48 overflow-y-auto"
				label="Choose simulcast season, {label(data.selected)} selected"
			>
				{#snippet trigger()}
					<CaretDownIcon size="0.875rem" weight="fill" />
					{label(data.selected)}
				{/snippet}

				{#snippet children()}
					<div role="menu" aria-label="Simulcast seasons">
						{#each data.seasons as option (href(option))}
							<Button
								role="menuitemradio"
								aria-checked={same(option, data.selected)}
								href={href(option)}
								variant="item"
							>
								{label(option)}
							</Button>
						{/each}
					</div>
				{/snippet}
			</Dropdown>
		{/snippet}
	</Catalog>
{/key}
