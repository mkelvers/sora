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

<div class="min-w-0 [&_.dropdown-trigger]:max-w-full [&_.dropdown-trigger]:gap-2 [&_.dropdown-trigger]:px-0 [&_.dropdown-trigger]:text-lg [&_.dropdown-trigger]:font-bold [&_.dropdown-trigger]:normal-case [&_.dropdown-trigger]:tracking-normal [&_.dropdown-trigger]:text-foreground [&_.dropdown-trigger]:hover:bg-transparent">
	<Dropdown id="seasons" alignment="left" className="max-h-[min(60vh,30rem)] w-max max-w-[min(28rem,calc(100vw-2rem))] overflow-y-auto *:p-0">
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
							'flex w-full items-center justify-start gap-6 px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground',
							other.id === season.id && 'bg-panel-hover text-foreground'
						)}
						onclick={() => (season = other)}
					>
						<span class="truncate">{other.title}</span>
						<span class="ml-auto text-xs tabular-nums">
							{other.episode_count}
							{other.episode_count === 1 ? 'Episode' : 'Episodes'}
						</span>
					</Button>
				{/each}
			</div>
		{/snippet}
	</Dropdown>
</div>
