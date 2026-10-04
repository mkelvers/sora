<script lang="ts" module>
	import { cva } from "class-variance-authority";

	const trigger = cva(
		"flex max-w-full cursor-pointer items-center gap-2 text-foreground transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
		{
			variants: {
				variant: {
					field:
						"h-10 w-full justify-between border border-border px-3 text-sm font-medium hover:border-border-strong aria-expanded:border-border-strong",
					heading:
						"py-2 text-lg font-bold hover:text-accent-secondary aria-expanded:text-accent-secondary",
				},
			},
		},
	);

	const content = cva(
		"inset-auto m-0 max-h-[min(60vh,24rem)] scrollbar-thin flex-col overflow-y-auto bg-dropdown shadow-2xl shadow-black/60 outline-none open:flex",
		{
			variants: {
				variant: {
					field: "min-w-(--melt-invoker-width)",
					heading: "w-[min(20rem,calc(100vw-2rem))]",
				},
			},
		},
	);

	const item = cva("flex w-full cursor-pointer items-center gap-6 px-5 text-left", {
		variants: {
			variant: {
				field:
					"min-h-11 py-3 text-sm text-muted aria-selected:text-foreground data-highlighted:bg-white/8 data-highlighted:text-foreground",
				heading:
					"min-h-11 py-2.5 text-base text-dropdown-foreground hover:bg-dropdown-hover aria-selected:text-foreground data-highlighted:text-foreground",
			},
		},
	});
</script>

<script lang="ts" generics="T extends string">
	import { cn } from "$lib/utils";
	import { Select } from "melt/builders";
	import { CaretDownIcon } from "phosphor-svelte";

	type Option = {
		value: T;
		label: string;
		detail?: string;
	};

	let {
		options,
		value = $bindable(),
		label,
		variant,
		class: className,
	}: {
		options: readonly Option[];
		value: T;
		label: string;
		variant: "field" | "heading";
		class?: string;
	} = $props();

	const select = new Select<T>({
		value: () => value,
		onValueChange: (next) => {
			if (next !== undefined) {
				value = next;
			}
		},
		sameWidth: false,
		floatingConfig: {
			computePosition: {
				placement: "bottom-start",
			},
			offset: 0,
		},
	});

	const selected = $derived(options.find((option) => option.value === value));
</script>

<button
	{...select.trigger}
	type="button"
	aria-label="{label}: {selected?.label}"
	class={cn(trigger({ variant }), className)}
>
	{#if variant === "heading"}
		<CaretDownIcon size="1.1rem" weight="fill" class="shrink-0" />
	{/if}
	<span class="truncate">{selected?.label}</span>
	{#if variant === "field"}
		<CaretDownIcon size="0.9rem" weight="fill" class="shrink-0 text-muted" />
	{/if}
</button>

<div
	{...select.content}
	aria-label={label}
	class={content({
		variant,
	})}
>
	{#each options as option (option.value)}
		<div
			{...select.getOption(option.value, option.label)}
			class={item({
				variant,
			})}
		>
			<span class="truncate">{option.label}</span>
			{#if option.detail}
				<span class="ml-auto shrink-0 text-xs tabular-nums">{option.detail}</span>
			{/if}
		</div>
	{/each}
</div>
