<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import Dropdown from "$lib/components/ui/dropdown.svelte";
	import Sheet from "$lib/components/ui/sheet.svelte";
	import Catalog from "$routes/(app)/(catalog)/components/catalog.svelte";
	import { CaretDownIcon } from "phosphor-svelte";

	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();

	let seasons = $state(false);

	const selected = $derived(data.selected);
</script>

<svelte:head>
	<title>Browse Simulcasted Anime - Sora</title>
</svelte:head>

{#key selected.slug}
	<Catalog
		title="Simulcast Season"
		empty={{
			title: `${selected.label} came up empty.`,
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
				variant="text"
				class="sm:hidden"
				aria-label="Choose simulcast season, {selected.label} selected"
				aria-haspopup="dialog"
				aria-controls="season-list"
				onclick={() => (seasons = true)}
			>
				<CaretDownIcon size="0.875rem" weight="fill" />
				{selected.label}
			</Button>
			<div class="hidden sm:block">
				<Dropdown
					variant="toolbar"
					class="max-h-80 min-w-48 overflow-y-auto"
					label="Choose simulcast season, {selected.label} selected"
				>
					{#snippet trigger()}
						<CaretDownIcon size="0.875rem" weight="fill" />
						{selected.label}
					{/snippet}

					{#snippet children()}
						<div role="menu" aria-label="Simulcast seasons">
							{#each data.seasons as option (option.slug)}
								<Button
									role="menuitemradio"
									aria-checked={option.slug === selected.slug}
									href="/simulcast/seasons/{option.slug}"
									variant="item"
								>
									{option.label}
								</Button>
							{/each}
						</div>
					{/snippet}
				</Dropdown>
			</div>
		{/snippet}
	</Catalog>
{/key}

<Sheet bind:open={seasons} id="season-list" title="Seasons">
	{#each data.seasons as option (option.slug)}
		<Button
			variant="item"
			href="/simulcast/seasons/{option.slug}"
			aria-current={option.slug === selected.slug ? "true" : undefined}
			onclick={() => (seasons = false)}
		>
			{option.label}
		</Button>
	{/each}
</Sheet>
