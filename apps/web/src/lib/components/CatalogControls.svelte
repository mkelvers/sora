<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import { cn } from "$lib/utils";
	import { CircleIcon, FunnelIcon, ListBulletsIcon, RadioButtonIcon } from "phosphor-svelte";

	type Filters = {
		audio?: "sub" | "dub";
		format?: "TV" | "MOVIE";
	};

	let {
		kind,
		genre,
		filters,
	}: {
		kind: "new" | "popular";
		genre?: string;
		filters: Filters;
	} = $props();

	const sorts = [
		{
			kind: "popular",
			label: "Popularity",
		},
		{
			kind: "new",
			label: "Newest",
		},
	] as const;

	const groups = [
		{
			id: "audio",
			label: "Language",
			options: [
				{
					label: "All",
					value: undefined,
				},
				{
					label: "Subtitled",
					value: "sub",
				},
				{
					label: "Dubbed",
					value: "dub",
				},
			],
		},
		{
			id: "format",
			label: "Media",
			options: [
				{
					label: "All",
					value: undefined,
				},
				{
					label: "Series",
					value: "TV",
				},
				{
					label: "Movies",
					value: "MOVIE",
				},
			],
		},
	] as const;

	const selectedSort = $derived(sorts.find((sort) => sort.kind === kind)!);
	const filtered = $derived(!!filters.audio || !!filters.format);

	const href = (target: "new" | "popular", patch: Filters = {}) => {
		const next = {
			...filters,
			...patch,
		};
		const query = new URLSearchParams(
			Object.entries(next).flatMap(([key, value]) => (value ? [[key, value]] : [])),
		).toString();
		const path = genre ? `/genres/${genre}` : `/${target}`;
		return query ? `${path}?${query}` : path;
	};
</script>

<div class="flex items-center gap-1">
	{#if !genre}
		<Dropdown variant="toolbar" class="w-52" label="Sort anime, {selectedSort.label} selected">
			{#snippet trigger()}
				<ListBulletsIcon size="1.2rem" weight="bold" />
				<span class="max-sm:hidden">{selectedSort.label}</span>
			{/snippet}

			{#snippet children()}
				<div role="menu" aria-label="Sort anime">
					{#each sorts as sort (sort.kind)}
						<Button
							role="menuitemradio"
							aria-checked={sort.kind === kind}
							href={href(sort.kind)}
							variant="item"
						>
							{sort.label}
						</Button>
					{/each}
				</div>
			{/snippet}
		</Dropdown>
	{/if}

	<Dropdown variant="toolbar" class="w-60" label="Filter anime">
		{#snippet trigger()}
			<FunnelIcon size="1.2rem" weight="bold" class={cn(filtered && "text-accent-secondary")} />
			<span class={cn("max-sm:hidden", filtered && "text-accent-secondary")}>Filter</span>
		{/snippet}

		{#snippet children()}
			<div role="menu" aria-label="Filter anime">
				{#each groups as group (group.id)}
					<div role="group" aria-labelledby="filter-{group.id}">
						<p id="filter-{group.id}" class="px-5 pt-3 pb-2 text-base font-bold text-foreground">
							{group.label}
						</p>
						{#each group.options as option (option.label)}
							{@const checked = filters[group.id] === option.value}
							<Button
								role="menuitemradio"
								aria-checked={checked}
								href={href(kind, {
									[group.id]: option.value,
								})}
								variant="item"
								class="gap-2.5"
							>
								{#if checked}
									<RadioButtonIcon size="1.25rem" weight="fill" class="text-accent-secondary" />
								{:else}
									<CircleIcon size="1.25rem" />
								{/if}
								{option.label}
							</Button>
						{/each}
					</div>
				{/each}
			</div>
		{/snippet}
	</Dropdown>
</div>
