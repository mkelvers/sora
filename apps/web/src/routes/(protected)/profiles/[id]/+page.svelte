<script lang="ts">
	import { enhance } from "$app/forms";
	import { page } from "$app/state";
	import StatusBanner from "$lib/components/StatusBanner.svelte";
	import Avatar from "$lib/components/ui/Avatar.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import { ShuffleIcon, UploadSimpleIcon } from "phosphor-svelte";

	import type { PageProps } from "./$types";

	let { data, form }: PageProps = $props();

	let selected = $derived(`${data.profile.avatar.style}:${data.profile.avatar.seed}`);
	let choices = $derived(data.choices);
	let pending = $state(false);
	let importing = $state(false);
	let watchlist = $state<HTMLInputElement>();

	const shown = $derived(
		[data.profile.avatar, ...choices]
			.map((avatar) => ({
				avatar,
				key: `${avatar.style}:${avatar.seed}`,
			}))
			.filter(({ key }, index, all) => all.findIndex((other) => other.key === key) === index),
	);
	const current = $derived(
		shown.find(({ key }) => key === selected)?.avatar ?? data.profile.avatar,
	);
</script>

<svelte:head>
	<title>Edit profile · Sora</title>
</svelte:head>

<StatusBanner message={form?.message ?? ""} tone="error" />

<div class="w-full max-w-xl">
	<form
		method="POST"
		action="?/save"
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
		<h1 class="text-3xl font-normal">Edit profile</h1>

		<div class="mt-10 grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-6">
			<Avatar avatar={current} alt="Selected avatar" class="size-24" />
			<div>
				<label class="block text-sm text-muted" for="name">Name</label>
				<Input
					id="name"
					name="name"
					class="mt-2 h-11 rounded-none"
					value={form?.name ?? data.profile.name}
					maxlength={40}
					autocomplete="off"
					required
				/>
			</div>
		</div>

		<fieldset class="mt-10">
			<legend class="float-left flex min-h-9 items-center text-sm text-muted">Avatar</legend>
			<div class="flex justify-end">
				<Button
					variant="ghost"
					class="min-h-9 px-3 text-xs font-bold text-muted uppercase hover:text-foreground"
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
					<ShuffleIcon size="1rem" aria-hidden="true" />
					More avatars
				</Button>
			</div>

			<div class="clear-both mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6">
				{#each shown as { avatar, key }, index (key)}
					<label
						class="cursor-pointer outline-2 outline-offset-2 outline-transparent transition-[outline-color] hover:outline-border-strong has-checked:outline-accent"
					>
						<input class="sr-only" type="radio" name="avatar" value={key} bind:group={selected} />
						<Avatar {avatar} alt="Avatar option {index + 1}" class="w-full" />
					</label>
				{/each}
			</div>
		</fieldset>

		<div class="mt-10 flex gap-3">
			<Button type="submit" variant="primary" class="flex-1" loading={pending}>Save</Button>
			<Button href="/profiles{page.url.search}" variant="outline" class="flex-1">Cancel</Button>
		</div>
	</form>

	<section class="mt-14" aria-labelledby="import-title">
		<h2 id="import-title" class="text-sm text-muted">Import from Arc</h2>
		<form
			method="POST"
			action="?/import"
			enctype="multipart/form-data"
			class="mt-3"
			use:enhance={() => {
				importing = true;
				return async ({ update }) => {
					await update();
					importing = false;
				};
			}}
		>
			<input
				bind:this={watchlist}
				class="sr-only"
				type="file"
				name="watchlist"
				accept="application/json,.json"
				tabindex="-1"
				aria-label="Arc watchlist export"
				onchange={(event) => event.currentTarget.form?.requestSubmit()}
			/>
			<Button
				variant="outline"
				class="w-full gap-2"
				loading={importing}
				onclick={() => watchlist?.click()}
			>
				<UploadSimpleIcon size="1rem" />
				Choose watchlist export
			</Button>
		</form>
		{#if form && "imported" in form && form.imported}
			<p class="mt-3 text-sm text-muted" role="status">
				Imported {form.imported.imported} titles{form.imported.waiting
					? `, ${form.imported.waiting} more once they're ready`
					: ""}{form.imported.not_found ? `, ${form.imported.not_found} not found` : ""}.
			</p>
		{/if}
	</section>
</div>
