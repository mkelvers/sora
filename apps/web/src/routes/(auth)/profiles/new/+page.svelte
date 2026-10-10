<script lang="ts">
	import { enhance } from "$app/forms";
	import { page } from "$app/state";
	import StatusBanner from "$lib/components/StatusBanner.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Field from "$lib/components/ui/Field.svelte";

	import type { PageProps } from "./$types";

	let { form }: PageProps = $props();

	let pending = $state(false);
</script>

<svelte:head>
	<title>Add Profile · Sora</title>
</svelte:head>

<StatusBanner message={form?.message ?? ""} tone="error" />

<form
	class="w-full max-w-104"
	method="POST"
	use:enhance={() => {
		pending = true;
		return async ({ update }) => {
			await update({
				reset: false,
			});
			pending = false;
		};
	}}
>
	<h1 class="text-center text-3xl font-bold">Add Profile</h1>
	<p class="mt-4 text-center text-sm text-muted">
		Each profile has its own home page and playback settings.
	</p>

	<Field
		name="name"
		label="Name"
		class="mt-12"
		value={form?.name ?? ""}
		maxlength={40}
		autocomplete="off"
		required
	/>

	<div class="mt-10 flex gap-3">
		<Button type="submit" variant="primary" class="flex-1" loading={pending}>Add Profile</Button>
		<Button href="/profiles{page.url.search}" variant="secondary" class="flex-1">Cancel</Button>
	</div>
</form>
