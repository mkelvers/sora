<script lang="ts">
	import type { Season } from "@sora/sdk";
	import { Select } from "melt/builders";
	import { CaretDownIcon } from "phosphor-svelte";

	let {
		seasons,
		season = $bindable(),
	}: {
		seasons: Season[];
		season: Season;
	} = $props();

	const select = new Select<string>({
		value: () => season.id,
		onValueChange: (id) => (season = seasons.find((other) => other.id === id) ?? season),
		sameWidth: false,
		floatingConfig: {
			computePosition: {
				placement: "bottom-start",
			},
		},
	});
</script>

<div class="min-w-0">
	<button
		{...select.trigger}
		type="button"
		aria-label="Season: {season.title}"
		class="flex max-w-full cursor-pointer items-center gap-2 py-2 text-lg font-bold text-foreground outline-none focus-visible:ring-1 focus-visible:ring-white/30"
	>
		<CaretDownIcon size="1.1rem" weight="fill" class="shrink-0" />
		<span class="truncate">{season.title}</span>
	</button>

	<div
		{...select.content}
		aria-label="Seasons"
		class="inset-auto m-0 max-h-[min(60vh,24rem)] w-[min(21rem,calc(100vw-2rem))] [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent] flex-col overflow-y-auto bg-dropdown shadow-2xl shadow-black/60 outline-none open:flex"
	>
		{#each seasons as other (other.id)}
			<div
				{...select.getOption(other.id, other.title)}
				class="flex w-full cursor-pointer items-center gap-6 px-5 py-3.5 text-left text-base text-dropdown-foreground data-highlighted:bg-dropdown-hover data-highlighted:text-foreground"
			>
				<span class="truncate">{other.title}</span>
				<span class="ml-auto shrink-0 text-xs tabular-nums">
					{#if other.episode_count === 1}
						1 Episode
					{:else}
						{other.episode_count} Episodes
					{/if}
				</span>
			</div>
		{/each}
	</div>
</div>
