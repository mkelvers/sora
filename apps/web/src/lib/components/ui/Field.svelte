<script lang="ts">
	import { EyeIcon, EyeSlashIcon } from "phosphor-svelte";
	import type { HTMLInputAttributes } from "svelte/elements";

	import Button from "./Button.svelte";
	import Input from "./Input.svelte";

	type Props = Omit<HTMLInputAttributes, "id" | "name" | "type" | "value" | "class"> & {
		name: string;
		label: string;
		type?: "email" | "password" | "text";
		value?: string;
		error?: string;
		class?: string;
	};

	let {
		name,
		label,
		type = "text",
		value = $bindable(""),
		error,
		class: className,
		...props
	}: Props = $props();

	let visible = $state(false);
</script>

<div class={className}>
	<label for={name} class="block text-sm text-muted">{label}</label>
	<div class="relative mt-2">
		<Input
			{...props}
			id={name}
			{name}
			type={type === "password" && visible ? "text" : type}
			class={type === "password" ? "pr-11" : undefined}
			bind:value
			aria-describedby={error ? `${name}-error` : undefined}
			aria-invalid={error ? "true" : undefined}
		/>
		{#if type === "password" && value}
			<Button
				variant="icon"
				class="absolute inset-y-0 right-0"
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
		<p id="{name}-error" class="mt-2 text-sm text-danger">{error}</p>
	{/if}
</div>
