<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import Dropdown from "$lib/components/ui/dropdown.svelte";
	import Sheet from "$lib/components/ui/sheet.svelte";
	import { browseHref, sorts } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import type { BrowseFilters } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import { ListBulletsIcon } from "phosphor-svelte";

	let {
		filters,
	}: {
		filters: BrowseFilters;
	} = $props();

	let sorting = $state(false);

	const current = $derived(sorts.find((sort) => sort.value === filters.sort) ?? sorts[0]);
</script>

<div class="max-sm:hidden">
	<Dropdown variant="toolbar" class="w-52" label="Sort anime, {current.label} selected">
		{#snippet trigger()}
			<ListBulletsIcon size="1.2rem" weight="bold" />
			{current.label}
		{/snippet}

		{#snippet children()}
			<div role="menu" aria-label="Sort anime">
				{#each sorts as sort (sort.value)}
					<Button
						role="menuitemradio"
						aria-checked={sort.value === filters.sort}
						href={browseHref({
							...filters,
							sort: sort.value,
						})}
						variant="item"
					>
						{sort.label}
					</Button>
				{/each}
			</div>
		{/snippet}
	</Dropdown>
</div>

<Button
	variant="icon"
	class="sm:hidden"
	aria-label="Sort anime, {current.label} selected"
	aria-haspopup="dialog"
	aria-controls="browse-sort"
	onclick={() => (sorting = true)}
>
	<ListBulletsIcon size="1.2rem" weight="bold" />
</Button>

<Sheet bind:open={sorting} id="browse-sort" title="Sort By">
	{#each sorts as sort (sort.value)}
		<Button
			variant="item"
			href={browseHref({
				...filters,
				sort: sort.value,
			})}
			aria-current={sort.value === filters.sort ? "true" : undefined}
			onclick={() => (sorting = false)}
		>
			{sort.label}
		</Button>
	{/each}
</Sheet>
