<script lang="ts">
	import { page } from "$app/state";
	import Button from "$lib/components/ui/button.svelte";
	import Sheet from "$lib/components/ui/sheet.svelte";
	import { ListIcon } from "phosphor-svelte";

	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();

	let menuOpen = $state(false);

	const groups = [
		{
			label: "Profile",
			sections: [
				{
					href: "/settings/playback",
					label: "Playback",
				},
				{
					href: "/settings/notifications",
					label: "Notifications",
				},
				{
					href: "/settings/library",
					label: "Import and Export",
				},
			],
		},
		{
			label: "Account",
			sections: [
				{
					href: "/settings/password",
					label: "Password",
				},
				{
					href: "/settings/devices",
					label: "Devices",
				},
			],
		},
	];
</script>

{#snippet navigation(spacious: boolean)}
	{#each groups as group (group.label)}
		<nav aria-labelledby="settings-{spacious ? 'sheet-' : ''}{group.label}">
			<h2
				id="settings-{spacious ? 'sheet-' : ''}{group.label}"
				class={spacious ? "px-5 text-lg font-bold" : "px-3 text-lg font-bold"}
			>
				{group.label}
			</h2>
			<ul class="mt-3">
				{#each group.sections as section (section.href)}
					<li>
						<a
							href={section.href}
							class={[
								"block text-muted outline-none hover:bg-surface hover:text-foreground focus-visible:bg-surface focus-visible:text-foreground aria-[current]:text-accent",
								spacious ? "px-5 py-4 text-base" : "px-3 py-3 text-sm",
							]}
							aria-current={page.url.pathname === section.href ? "page" : undefined}
							onclick={() => (menuOpen = false)}
						>
							{section.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	{/each}
{/snippet}

<div class="page max-sm:pb-4!">
	<div class="mx-auto max-w-5xl">
		<div class="mb-8 flex items-center justify-between gap-4 md:mb-10">
			<h1 class="text-2xl font-bold">Account Settings</h1>
			<Button
				variant="icon"
				class="-mr-3 md:hidden"
				aria-label="Settings menu"
				aria-haspopup="dialog"
				onclick={() => (menuOpen = true)}
			>
				<ListIcon size="1.5rem" />
			</Button>
		</div>

		<div class="flex flex-col gap-10 md:flex-row md:items-start md:gap-12">
			<div class="hidden shrink-0 flex-col gap-10 md:flex md:w-56">
				{@render navigation(false)}
			</div>

			<div class="min-w-0 flex-1">
				{@render children()}
			</div>
		</div>
	</div>
</div>

<Sheet bind:open={menuOpen} id="settings-menu" title="Account Settings">
	<div class="flex flex-col gap-8 py-2">
		{@render navigation(true)}
	</div>
</Sheet>
