<script lang="ts">
	import { CheckSquareIcon, CircleIcon, RadioButtonIcon, SquareIcon } from "phosphor-svelte";

	let {
		type,
		name,
		checked,
		label,
		onchange,
	}: {
		type: "checkbox" | "radio";
		name: string;
		checked: boolean;
		label: string;
		onchange: () => void;
	} = $props();
</script>

<label
	class="flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-5 py-3 text-left text-sm text-muted transition-colors duration-150 select-none hover:bg-hover hover:text-foreground has-checked:text-foreground has-focus-visible:bg-hover has-focus-visible:text-foreground max-sm:min-h-13 max-sm:text-base"
>
	<input
		{type}
		{name}
		{checked}
		class="sr-only"
		{onchange}
		onkeydown={(event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				onchange();
			}
		}}
	/>
	{#if type === "radio"}
		{#if checked}
			<RadioButtonIcon size="1.25rem" weight="fill" class="shrink-0 text-accent-secondary" />
		{:else}
			<CircleIcon size="1.25rem" class="shrink-0" />
		{/if}
	{:else if checked}
		<CheckSquareIcon size="1.25rem" weight="fill" class="shrink-0 text-accent-secondary" />
	{:else}
		<SquareIcon size="1.25rem" class="shrink-0" />
	{/if}
	<span class="min-w-0 truncate">{label}</span>
</label>
