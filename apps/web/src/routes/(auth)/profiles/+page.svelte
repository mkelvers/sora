<script lang="ts">
	import { enhance } from "$app/forms";
	import { page } from "$app/state";
	import Avatar from "$lib/components/ui/Avatar.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import { PencilSimpleIcon, PlusIcon } from "phosphor-svelte";

	import type { PageProps } from "./$types";
	import { profilesPage } from "./profiles.svelte";

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{profilesPage.managing ? "Manage profiles" : "Who's watching?"} · Sora</title>
</svelte:head>

<div class="flex w-full max-w-5xl flex-col items-center gap-12">
	<h1 class="text-center text-3xl font-bold">
		{#if profilesPage.managing}
			Manage profiles
		{:else}
			Who's watching?
		{/if}
	</h1>

	<form method="POST" action="?/select{page.url.search.replace('?', '&')}" use:enhance>
		<ul class="flex flex-wrap justify-center gap-x-8 gap-y-10">
			{#each data.profiles as profile (profile.id)}
				<li>
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
					{:else}
						<button
							type="submit"
							name="profile"
							value={profile.id}
							aria-label="Watch as {profile.name}"
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
							class="grid size-32 place-items-center bg-surface text-muted transition-colors group-hover:bg-raised group-hover:text-foreground sm:size-36"
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
			<Button variant="secondary" onclick={() => (profilesPage.managing = true)}>
				Manage profiles
			</Button>
		{/if}
	</div>
</div>
