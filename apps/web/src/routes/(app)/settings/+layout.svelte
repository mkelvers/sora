<script lang="ts">
	import { page } from "$app/state";

	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();

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

<div class="page">
	<div class="mx-auto max-w-5xl">
		<h1 class="mb-10 text-2xl font-bold">Account Settings</h1>

		<div class="flex flex-col gap-10 md:flex-row md:items-start md:gap-12">
			<div class="flex shrink-0 flex-col gap-10 md:w-56">
				{#each groups as group (group.label)}
					<nav aria-labelledby="settings-{group.label}">
						<h2 id="settings-{group.label}" class="px-3 text-lg font-bold">{group.label}</h2>
						<ul class="mt-3">
							{#each group.sections as section (section.href)}
								<li>
									<a
										href={section.href}
										class="block px-3 py-3 text-sm text-muted outline-none hover:bg-surface hover:text-foreground focus-visible:bg-surface focus-visible:text-foreground aria-[current]:text-accent"
										aria-current={page.url.pathname === section.href ? "page" : undefined}
									>
										{section.label}
									</a>
								</li>
							{/each}
						</ul>
					</nav>
				{/each}
			</div>

			<div class="min-w-0 flex-1">
				{@render children()}
			</div>
		</div>
	</div>
</div>
