<script lang="ts">
	import { page } from "$app/state";

	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();

	const groups = [
		{
			label: "General",
			sections: [
				{
					href: "/settings/preferences",
					label: "Preferences",
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
			],
		},
	];
</script>

<div class="page">
	<div class="mx-auto max-w-5xl">
		<h1 class="mb-10 text-2xl font-bold">Account Settings</h1>

		<div class="flex flex-col gap-10 md:flex-row md:items-start md:gap-12">
			<div class="flex shrink-0 flex-col gap-8 md:w-56">
				{#each groups as group (group.label)}
					<nav aria-labelledby="settings-{group.label}">
						<h2 id="settings-{group.label}" class="text-lg font-bold">{group.label}</h2>
						<ul class="mt-3 space-y-1">
							{#each group.sections as section (section.href)}
								<li>
									<a
										href={section.href}
										class="block py-2 text-sm text-muted outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[current]:text-accent"
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
