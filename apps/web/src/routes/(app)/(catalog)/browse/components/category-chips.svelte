<script lang="ts">
	import Button from "$lib/components/ui/button.svelte";
	import Dropdown from "$lib/components/ui/dropdown.svelte";
	import { countries, sources, toggle } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import type { BrowseFilters } from "$routes/(app)/(catalog)/browse/browse.svelte";
	import { filterGroups } from "$routes/(app)/(catalog)/catalog.svelte";
	import type { Tag } from "@sora/sdk";
	import { PlusIcon, XIcon } from "phosphor-svelte";

	let {
		filters,
		genres,
		tags,
		onchange,
	}: {
		filters: BrowseFilters;
		genres: string[];
		tags: Tag[];
		onchange: (next: BrowseFilters) => void;
	} = $props();

	interface Choice {
		label: string;
		checked: boolean;
		all: boolean;
		next: Partial<BrowseFilters>;
	}

	interface Menu {
		id: string;
		label: string;
		role: "menuitemradio" | "menuitemcheckbox";
		choices: Choice[];
	}

	const names = $derived(
		tags.map((tag) => tag.name).toSorted((left, right) => left.localeCompare(right)),
	);

	const chosen = $derived([
		...filters.tags.map((name) => ({
			name,
			next: {
				tags: toggle(filters.tags, name),
			},
		})),
		...filters.studios.map((name) => ({
			name,
			next: {
				studios: toggle(filters.studios, name),
			},
		})),
	]);

	const menus = $derived<Menu[]>([
		...filterGroups.map((group): Menu => ({
			choices: group.options.map((option) => ({
				all: option.value === undefined,
				checked: filters[group.id] === option.value,
				label: option.label,
				next: {
					[group.id]: option.value,
				},
			})),
			id: group.id,
			label: group.label,
			role: "menuitemradio",
		})),
		{
			choices: [undefined, ...countries].map((country) => ({
				all: country === undefined,
				checked: filters.country === country?.value,
				label: country?.label ?? "All",
				next: {
					country: country?.value,
				},
			})),
			id: "country",
			label: "Country",
			role: "menuitemradio",
		},
		{
			choices: sources.map((source) => ({
				all: false,
				checked: filters.sources.includes(source.value),
				label: source.label,
				next: {
					sources: toggle(filters.sources, source.value),
				},
			})),
			id: "source",
			label: "Source",
			role: "menuitemcheckbox",
		},
	]);
</script>

<div class="mb-8 flex flex-col gap-3">
	<ul
		aria-label="Genres"
		class="-mx-5 flex [scrollbar-width:none] gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0"
	>
		{#each genres as genre (genre)}
			<li class="shrink-0">
				<Button
					variant="chip"
					aria-pressed={filters.genres.includes(genre)}
					onclick={() =>
						onchange({
							...filters,
							genres: toggle(filters.genres, genre),
						})}
				>
					{genre}
				</Button>
			</li>
		{/each}
	</ul>

	<ul aria-label="Refine" class="flex flex-wrap gap-2">
		{#each menus as menu (menu.id)}
			{@const selected = menu.choices
				.filter((choice) => choice.checked && !choice.all)
				.map((choice) => choice.label)}
			<li>
				<Dropdown
					variant="chip"
					alignment="left"
					class="w-52"
					label={selected.length ? `${menu.label}, ${selected.join(", ")} selected` : menu.label}
				>
					{#snippet trigger()}
						<span data-active={selected.length ? "" : undefined}>
							{selected.length ? selected.join(", ") : menu.label}
						</span>
					{/snippet}

					{#snippet children()}
						<div role="menu" aria-label={menu.label}>
							{#each menu.choices as choice (choice.label)}
								<Button
									role={menu.role}
									aria-checked={choice.checked}
									variant="item"
									onclick={() =>
										onchange({
											...filters,
											...choice.next,
										})}
								>
									{choice.label}
								</Button>
							{/each}
						</div>
					{/snippet}
				</Dropdown>
			</li>
		{/each}
		<li>
			<Button
				variant="chip"
				aria-pressed={filters.hideMature}
				onclick={() =>
					onchange({
						...filters,
						hideMature: !filters.hideMature,
					})}
			>
				Hide mature
			</Button>
		</li>
		<li>
			<Dropdown
				variant="chip"
				alignment="left"
				class="max-h-96 w-64 scrollbar-thin overflow-y-auto"
				label="Add a tag"
			>
				{#snippet trigger()}
					<PlusIcon size="0.875rem" weight="bold" />
					Tags
				{/snippet}

				{#snippet children()}
					<div role="menu" aria-label="Tags">
						{#each names as name (name)}
							<Button
								role="menuitemcheckbox"
								aria-checked={filters.tags.includes(name)}
								variant="item"
								onclick={() =>
									onchange({
										...filters,
										tags: toggle(filters.tags, name),
									})}
							>
								{name}
							</Button>
						{/each}
					</div>
				{/snippet}
			</Dropdown>
		</li>
		{#each chosen as chip (chip.name)}
			<li>
				<Button
					variant="chip"
					aria-pressed="true"
					aria-label="Remove {chip.name}"
					onclick={() =>
						onchange({
							...filters,
							...chip.next,
						})}
				>
					{chip.name}
					<XIcon size="0.875rem" weight="bold" />
				</Button>
			</li>
		{/each}
	</ul>
</div>
