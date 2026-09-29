<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import { EyeIcon, EyeSlashIcon } from "phosphor-svelte";
	import type { HTMLInputAttributes } from "svelte/elements";

	let {
		name,
		label,
		type = "text",
		autocomplete,
		value = $bindable(""),
		constraints = {},
		error,
		autocapitalize,
		spellcheck,
	}: {
		name: string;
		label: string;
		type?: "email" | "password" | "text";
		autocomplete: HTMLInputAttributes["autocomplete"];
		value?: string;
		constraints?: Pick<
			HTMLInputAttributes,
			"required" | "minlength" | "maxlength" | "pattern" | "min" | "max" | "step"
		>;
		error?: string;
		autocapitalize?: HTMLInputAttributes["autocapitalize"];
		spellcheck?: boolean;
	} = $props();

	let visible = $state(false);
</script>

<div>
	<div
		class="relative h-13 border-b border-border-strong transition-colors focus-within:border-accent"
	>
		<Input
			id={name}
			class="peer inline-block h-full w-full rounded-none border-0 bg-transparent px-0 py-0 pt-8 pr-14 text-base transition-none outline-none placeholder:text-transparent focus-visible:border-0 focus-visible:ring-0"
			{name}
			type={type === "password" && visible ? "text" : type}
			placeholder=" "
			{autocomplete}
			{autocapitalize}
			{spellcheck}
			{...constraints}
			{value}
			oninput={(event) => (value = event.currentTarget.value)}
			aria-describedby={error ? `${name}-error` : undefined}
			aria-invalid={error ? "true" : undefined}
		/>
		<label
			for={name}
			class="pointer-events-none absolute top-1 left-0 text-xs transition-[top,font-size,color] peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-focus:top-1 peer-focus:text-xs peer-focus:text-accent"
		>
			{label}
		</label>
		{#if type === "password" && value}
			<Button
				variant="icon"
				class="absolute right-0 bottom-1"
				aria-label="Show password"
				aria-pressed={visible}
				onclick={() => (visible = !visible)}
			>
				{#if visible}
					<EyeSlashIcon size="1.25rem" />
				{:else}
					<EyeIcon size="1.25rem" />
				{/if}
			</Button>
		{/if}
	</div>
	{#if error}
		<p id={`${name}-error`} class="mt-2 text-sm text-status-error">{error}</p>
	{/if}
</div>
