<script lang="ts">
	import { enhance } from "$app/forms";
	import { page } from "$app/state";
	import StatusBanner from "$lib/components/StatusBanner.svelte";
	import Avatar from "$lib/components/ui/Avatar.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import { PencilSimpleIcon, PlusIcon, TrashIcon } from "phosphor-svelte";

	import type { PageProps } from "./$types";
	import { profilesPage } from "./profiles.svelte";

	let { data, form }: PageProps = $props();

	let deleting = $state<string | null>(null);
</script>

<svelte:head>
	<title>{profilesPage.managing ? "Manage profiles" : "Who's watching?"} · Sora</title>
</svelte:head>

<StatusBanner message={form?.message ?? ""} tone="error" />

<div class="flex w-full max-w-5xl flex-col items-center gap-12">
	<h1 class="text-center text-3xl font-normal">
		{#if profilesPage.managing}
			Manage profiles
		{:else}
			Who's watching?
		{/if}
	</h1>

	<form
		method="POST"
		action="?/{profilesPage.managing ? 'delete' : 'select'}{page.url.search.replace('?', '&')}"
		use:enhance={({ submitter }) => {
			if (profilesPage.managing && submitter instanceof HTMLButtonElement) {
				deleting = submitter.value;
			}
			return async ({ update }) => {
				await update();
				deleting = null;
			};
		}}
	>
		<ul class="flex flex-wrap justify-center gap-x-8 gap-y-10">
			{#each data.profiles as profile (profile.id)}
				<li class="relative">
					{#if profilesPage.managing}
						<a
							class="group flex w-32 flex-col items-center gap-3 sm:w-36"
							href="/profiles/{profile.id}{page.url.search}"
							aria-label="Edit {profile.name}"
						>
							<span class="relative grid size-32 place-items-center sm:size-36">
								<Avatar
									avatar={profile.avatar}
									alt="Avatar of {profile.name}"
									class="size-full opacity-40 transition-opacity group-hover:opacity-60"
								/>
								<PencilSimpleIcon
									size="2.5rem"
									class="absolute text-foreground"
									aria-hidden="true"
								/>
							</span>
							<span class="max-w-full truncate text-sm text-muted group-hover:text-foreground">
								{profile.name}
							</span>
						</a>
						{#if data.profiles.length > 1}
							<Button
								type="submit"
								name="profile"
								value={profile.id}
								disabled={deleting !== null}
								variant="icon"
								class="absolute top-2 right-2 bg-canvas/80 text-status-error hover:bg-status-error hover:text-foreground"
								aria-label="Delete {profile.name}"
							>
								<TrashIcon size="1.1rem" aria-hidden="true" />
							</Button>
						{/if}
					{:else}
						<button
							type="submit"
							name="profile"
							value={profile.id}
							class="group flex w-32 cursor-pointer flex-col items-center gap-3 sm:w-36"
						>
							<Avatar
								avatar={profile.avatar}
								alt="Avatar of {profile.name}"
								class="size-32 outline-2 outline-offset-4 outline-transparent transition-[outline-color] group-hover:outline-foreground group-focus-visible:outline-foreground sm:size-36"
							/>
							<span class="max-w-full truncate text-sm text-muted group-hover:text-foreground">
								{profile.name}
							</span>
						</button>
					{/if}
				</li>
			{/each}

			{#if !profilesPage.managing}
				<li>
					<a
						class="group flex w-32 flex-col items-center gap-3 sm:w-36"
						href="/profiles/new{page.url.search}"
					>
						<span
							class="grid size-32 place-items-center bg-surface text-muted transition-colors group-hover:bg-panel group-hover:text-foreground sm:size-36"
						>
							<PlusIcon size="3rem" aria-hidden="true" />
						</span>
						<span class="text-sm text-muted group-hover:text-foreground">Add profile</span>
					</a>
				</li>
			{/if}
		</ul>
	</form>

	<div class="flex flex-wrap items-center justify-center gap-3">
		{#if profilesPage.managing}
			<Button variant="primary" onclick={() => (profilesPage.managing = false)}>Done</Button>
		{:else}
			<Button variant="outline" onclick={() => (profilesPage.managing = true)}>
				Manage profiles
			</Button>
		{/if}

		<form method="POST" action="/logout">
			<Button type="submit" variant="ghost" class="min-h-11 px-5">Sign out</Button>
		</form>
	</div>
</div>
