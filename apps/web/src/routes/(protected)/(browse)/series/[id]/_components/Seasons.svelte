<script lang="ts">
	import { CaretDownIcon } from 'phosphor-svelte';
	import type { Season } from '@sora/sdk';
	import Button from '$lib/components/ui/Button.svelte';
	import Dropdown from '$lib/components/ui/Dropdown.svelte';
	import { cn } from '$lib/utils';

	let {
		seasons,
		season = $bindable(),
	}: {
		seasons: Season[];
		season: Season;
	} = $props();
</script>

<div class="min-w-0 [&_.dropdown-trigger]:max-w-full [&_.dropdown-trigger]:gap-2 [&_.dropdown-trigger]:bg-transparent! [&_.dropdown-trigger]:px-0 [&_.dropdown-trigger]:text-lg [&_.dropdown-trigger]:font-bold [&_.dropdown-trigger]:normal-case [&_.dropdown-trigger]:tracking-normal [&_.dropdown-trigger]:text-foreground!">
	<Dropdown
		id="seasons"
		alignment="left"
		className="mt-2 max-h-[min(60vh,24rem)] w-[min(21rem,calc(100vw-2rem))] gap-0 overflow-y-auto py-2 shadow-2xl shadow-black/60 [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin] *:p-0"
	>
		{#snippet trigger()}
			<CaretDownIcon size="1.1rem" weight="fill" />
			<span class="truncate">{season.title}</span>
		{/snippet}

		{#snippet children()}
			<div role="menu" aria-label="Seasons">
				{#each seasons as other (other.id)}
					<Button
						role="menuitemradio"
						aria-checked={other.id === season.id}
						popovertarget="seasons"
						popovertargetaction="hide"
						class={cn(
							'flex w-full items-center justify-start gap-6 px-5 py-3.5 text-left text-base font-normal text-dropdown-foreground hover:bg-dropdown-hover hover:text-foreground focus-visible:bg-dropdown-hover focus-visible:ring-0',
							other.id === season.id && 'text-foreground'
						)}
						onclick={() => (season = other)}
					>
						<span class="truncate">{other.title}</span>
						<span class="ml-auto shrink-0 text-xs tabular-nums">
							{other.episode_count}
							{other.episode_count === 1 ? 'Episode' : 'Episodes'}
						</span>
					</Button>
				{/each}
			</div>
		{/snippet}
	</Dropdown>
</div>
