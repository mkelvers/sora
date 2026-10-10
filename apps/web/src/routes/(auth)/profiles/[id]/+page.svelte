<script lang="ts">
	import { enhance } from "$app/forms";
	import { page } from "$app/state";
	import StatusBanner from "$lib/components/StatusBanner.svelte";
	import Avatar from "$lib/components/ui/Avatar.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Field from "$lib/components/ui/Field.svelte";
	import { ShuffleIcon, TrashIcon } from "phosphor-svelte";

	import type { PageProps } from "./$types";

	let { data, form }: PageProps = $props();

	let selected = $derived(`${data.profile.avatar.style}:${data.profile.avatar.seed}`);
	let choices = $derived(data.choices);
	let pending = $state(false);

	const shown = $derived(
		[data.profile.avatar, ...choices]
			.map((avatar) => ({
				avatar,
				key: `${avatar.style}:${avatar.seed}`,
			}))
			.filter(({ key }, index, all) => all.findIndex((other) => other.key === key) === index),
	);
</script>

<svelte:head>
	<title>Edit Profile · Sora</title>
</svelte:head>

<StatusBanner message={form?.message ?? ""} tone="error" />

<form
	class="w-full max-w-xl"
	method="POST"
	action="?/save{page.url.search.replace('?', '&')}"
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
	<h1 class="text-center text-3xl font-bold">Edit Profile</h1>

	<Field
		name="name"
		label="Name"
		class="mt-12"
		value={form?.name ?? data.profile.name}
		maxlength={40}
		autocomplete="off"
		required
	/>

	<fieldset class="mt-8">
		<legend class="float-left flex h-9 items-center text-sm text-muted">Avatar</legend>
		<div class="flex justify-end">
			<Button
				variant="ghost"
				size="sm"
				class="-mr-2"
				onclick={() =>
					(choices = choices.map((choice) =>
						`${choice.style}:${choice.seed}` === selected
							? choice
							: {
									style: choice.style,
									seed: crypto.randomUUID().slice(0, 8),
								},
					))}
			>
				<ShuffleIcon size="1rem" />
				More Avatars
			</Button>
		</div>

		<div class="clear-both mt-2 grid grid-cols-4 gap-3 sm:grid-cols-6">
			{#each shown as { avatar, key }, index (key)}
				<label
					class="cursor-pointer outline-2 outline-offset-2 outline-transparent transition-[outline-color] hover:outline-border-strong has-checked:outline-accent has-focus-visible:outline-accent"
				>
					<input class="sr-only" type="radio" name="avatar" value={key} bind:group={selected} />
					<Avatar {avatar} alt="Avatar option {index + 1}" />
				</label>
			{/each}
		</div>
	</fieldset>

	<div class="mt-10 flex flex-wrap items-center gap-3">
		<Button type="submit" variant="primary" class="max-sm:flex-1" loading={pending}>
			Save Profile
		</Button>
		<Button href="/profiles{page.url.search}" variant="secondary" class="max-sm:flex-1">
			Cancel
		</Button>
		{#if data.deletable}
			<div class="ml-auto flex justify-end max-sm:basis-full">
				<Button
					type="submit"
					formaction="?/delete{page.url.search.replace('?', '&')}"
					formnovalidate
					variant="ghost"
					size="sm"
					tone="danger"
					class="-mr-2"
					disabled={pending}
				>
					<TrashIcon size="1rem" />
					Delete Profile
				</Button>
			</div>
		{/if}
	</div>
</form>
