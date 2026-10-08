<script lang="ts" generics="T extends string">
	import { cn } from "$lib/utils";
	import { Tabs } from "melt/builders";
	import type { Snippet } from "svelte";

	let {
		items,
		value = $bindable(),
		label,
		actions,
		children,
		class: className,
		panelClass,
	}: {
		items: readonly {
			value: T;
			label: string;
		}[];
		value: T;
		label: string;
		actions?: Snippet;
		children: Snippet<[T]>;
		class?: string;
		panelClass?: string;
	} = $props();

	const tabs = new Tabs<T>({
		value: () => value,
		onValueChange: (next) => (value = next),
	});
</script>

<div class={cn("flex items-center gap-4 border-b border-border", className)}>
	<div {...tabs.triggerList} aria-label={label} class="-mb-px flex min-w-0">
		{#each items as item (item.value)}
			<button
				{...tabs.getTrigger(item.value)}
				type="button"
				class="inline-flex h-12 cursor-pointer items-center border-b-2 border-transparent px-5 text-sm font-medium tracking-wide text-muted uppercase transition-colors outline-none hover:text-foreground focus-visible:bg-hover aria-selected:border-accent aria-selected:text-foreground"
			>
				{item.label}
			</button>
		{/each}
	</div>
	{@render actions?.()}
</div>

{#each items as item (item.value)}
	<div {...tabs.getContent(item.value)} class={panelClass}>
		{#if item.value === value}
			{@render children(item.value)}
		{/if}
	</div>
{/each}
