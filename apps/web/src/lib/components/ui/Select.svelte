<script lang="ts" module>
	import { cva } from "class-variance-authority";

	const trigger = cva(
		"flex max-w-full cursor-pointer items-center gap-2 text-foreground transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
		{
			variants: {
				variant: {
					field:
						"h-11 w-full justify-between border border-border px-3 text-sm hover:border-border-strong aria-expanded:border-border-strong",
					heading: "-ml-3 h-11 px-3 text-lg font-bold hover:bg-hover aria-expanded:bg-hover",
				},
			},
		},
	);

	const content = cva(
		"inset-auto m-0 max-h-[min(60vh,24rem)] scrollbar-thin flex-col overflow-y-auto bg-raised shadow-lg outline-none open:flex",
		{
			variants: {
				variant: {
					field: "min-w-(--melt-invoker-width)",
					heading: "w-[min(20rem,calc(100vw-2rem))]",
				},
			},
		},
	);
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
		scrollAlignment: "nearest",
		floatingConfig: {
			computePosition: {
				placement: "bottom-start",
			},
			offset: 0,
			flip: {
				mainAxis: false,
			},
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
	{@attach (node) => {
		node.focus = (options) =>
			HTMLElement.prototype.focus.call(node, {
				...options,
				preventScroll: true,
			});
	}}
	class={content({
		variant,
	})}
>
	{#each options as option (option.value)}
		<div
			{...select.getOption(option.value, option.label)}
			class="flex min-h-11 w-full cursor-pointer items-center gap-6 px-5 py-3 text-left text-sm text-muted aria-selected:text-foreground data-highlighted:bg-hover data-highlighted:text-foreground max-sm:min-h-13 max-sm:text-base"
		>
			<span class="truncate">{option.label}</span>
			{#if option.detail}
				<span class="ml-auto shrink-0 text-xs text-subtle tabular-nums">{option.detail}</span>
			{/if}
		</div>
	{/each}
</div>
