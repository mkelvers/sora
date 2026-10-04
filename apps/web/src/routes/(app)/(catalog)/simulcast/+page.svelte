<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Sheet from "$lib/components/ui/Sheet.svelte";
	import Catalog from "$routes/(app)/(catalog)/components/Catalog.svelte";
	import { CaretDownIcon } from "phosphor-svelte";

	import type { PageProps } from "./$types";
	import { simulcast } from "./simulcast.svelte";

	let { data }: PageProps = $props();

	// Whether the "Season List" sheet is open.
	let seasons = $state(false);

	const selected = $derived(
		data.seasons.find((option) => option.slug === simulcast.slug) ?? data.current,
	);
</script>

<svelte:head>
	<title>{selected.label} Simulcast Season · Sora</title>
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
				variant="ghost"
				class="min-h-11 gap-2 px-0 tracking-normal hover:bg-transparent hover:text-muted sm:hidden"
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
									onclick={() => (simulcast.slug = option.slug)}
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

<Sheet bind:open={seasons} id="season-list" title="Season List">
	{#each data.seasons as option (option.slug)}
		<Button
			variant="item"
			aria-current={option.slug === selected.slug ? "true" : undefined}
			class="aria-current:font-normal aria-current:text-foreground"
			onclick={() => {
				seasons = false;
				simulcast.slug = option.slug;
			}}
		>
			{option.label}
		</Button>
	{/each}
</Sheet>
