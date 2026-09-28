<script lang="ts">
	import { enhance } from "$app/forms";
	import { page } from "$app/state";
	import StatusBanner from "$lib/components/StatusBanner.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Input from "$lib/components/ui/Input.svelte";

	import type { PageProps } from "./$types";

	let { form }: PageProps = $props();

	let pending = $state(false);
</script>

<svelte:head>
	<title>Sora — Add profile</title>
</svelte:head>

<StatusBanner message={form?.message ?? ""} tone="error" />

<form
	class="w-full max-w-104"
	method="POST"
	use:enhance={() => {
		pending = true;
		return async ({ update }) => {
			await update({ reset: false });
			pending = false;
		};
	}}
>
	<h1 class="text-center text-3xl font-normal">Add profile</h1>
	<p class="mt-4 text-center text-sm text-muted">
		Each profile keeps its own library, progress, and recommendations.
	</p>

	<label class="mt-12 block text-sm text-muted" for="name">Name</label>
	<Input
		id="name"
		name="name"
		class="mt-2 h-11 rounded-none"
		value={form?.name ?? ""}
		maxlength={40}
		autocomplete="off"
		required
	/>

	<div class="mt-10 flex gap-3">
		<Button
			type="submit"
			class="min-h-11 flex-1 bg-accent px-4 text-xs font-bold text-on-accent uppercase hover:brightness-110"
			disabled={pending}
		>
			{pending ? "Adding…" : "Add profile"}
		</Button>
		<a
			class="inline-flex min-h-11 flex-1 items-center justify-center border-2 border-border-strong px-4 text-xs font-bold text-muted uppercase hover:border-foreground hover:text-foreground"
			href="/profiles{page.url.search}"
		>
			Cancel
		</a>
	</div>
</form>
