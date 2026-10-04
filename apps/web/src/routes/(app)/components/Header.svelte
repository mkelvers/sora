<script lang="ts">
	import { page } from "$app/state";
	import logo from "$lib/assets/logo.png";
	import { getGenres } from "$lib/catalog.remote";
	import Avatar from "$lib/components/ui/Avatar.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import { cn, genreSlug } from "$lib/utils";
	import { profilesPage } from "$routes/(auth)/profiles/profiles.svelte";
	import type { Profile } from "@sora/sdk";
	import {
		BookmarkSimpleIcon,
		CaretDownIcon,
		ListIcon,
		PencilSimpleIcon,
		SignOutIcon,
		UsersIcon,
	} from "phosphor-svelte";

	import Search from "./Search.svelte";

	let {
		profile,
		profiles,
	}: {
		profile: Profile;
		profiles: Profile[];
	} = $props();

	const others = $derived(profiles.filter((other) => other.id !== profile.id));
	const here = $derived(encodeURIComponent(page.url.pathname + page.url.search));
	const genresQuery = getGenres();
	const genres = $derived(genresQuery.current ?? []);

	let categoriesOpen = $state(false);

	const sections = [
		{
			href: "/new",
			label: "New",
		},
		{
			href: "/popular",
			label: "Popular",
		},
		{
			href: "/simulcast",
			label: "Simulcast",
		},
	];

	const categories = [
		...sections,
		{
			href: "/calendar",
			label: "Release Calendar",
		},
	];
</script>

<header class="fixed inset-x-0 top-0 z-50 h-14 bg-header backdrop-blur">
	<nav class="group/nav flex h-full items-center justify-end" aria-label="Primary">
		<div
			class="h-full sm:hidden [&_.dropdown-root]:h-full [&_.dropdown-trigger]:h-full [&_.dropdown-trigger]:w-12 [&_.dropdown-trigger]:justify-center [&_.dropdown-trigger]:p-0 [&_.dropdown-trigger]:text-muted [&_.dropdown-trigger]:hover:bg-header-hover [&_.dropdown-trigger]:hover:text-foreground has-[.dropdown-menu:popover-open]:[&_.dropdown-trigger]:bg-header-hover has-[.dropdown-menu:popover-open]:[&_.dropdown-trigger]:text-foreground"
		>
			<Dropdown
				alignment="left"
				class="mobile-menu fixed! top-14! bottom-0! left-0! h-auto w-full gap-0 overflow-y-auto bg-header-hover"
				label="Menu"
			>
				{#snippet trigger()}
					<ListIcon size="1.5rem" />
				{/snippet}

				{#snippet children()}
					<ul class="flex flex-col">
						{#each [{ href: "/", label: "Home" }, ...categories, { href: "/watchlist", label: "Watchlist" }] as section (section.href)}
							<li>
								<Button
									href={section.href}
									variant="item"
									class="text-[0.9375rem]"
									aria-current={page.url.pathname === section.href ? "page" : undefined}
								>
									{section.label}
								</Button>
							</li>
						{/each}
						<li>
							<Button
								variant="item"
								class="justify-between text-[0.9375rem] aria-expanded:text-foreground"
								aria-expanded={categoriesOpen}
								aria-controls="menu-genres"
								onclick={(event: MouseEvent) => {
									event.stopPropagation();
									categoriesOpen = !categoriesOpen;
								}}
							>
								Categories
								<CaretDownIcon
									size="1rem"
									weight="fill"
									class={cn("transition-transform", categoriesOpen && "rotate-180")}
								/>
							</Button>
							{#if categoriesOpen}
								<ul id="menu-genres" class="bg-white/4">
									{#each genres as genre (genre)}
										<li>
											<Button
												href="/genres/{genreSlug(genre)}"
												variant="item"
												class="pl-9 text-[0.9375rem] aria-[current=page]:font-normal aria-[current=page]:text-accent"
												aria-current={page.params.genre === genreSlug(genre) ? "page" : undefined}
											>
												{genre}
											</Button>
										</li>
									{/each}
								</ul>
							{/if}
						</li>
					</ul>
				{/snippet}
			</Dropdown>
		</div>

		<a
			href="/"
			class="inline-flex h-full items-center px-1 max-[60rem]:group-has-[[role=search]>div:not([inert])]/nav:mr-auto max-sm:mr-auto sm:px-3"
			aria-label="Home"
			aria-current={page.url.pathname === "/" ? "page" : undefined}
		>
			<img src={logo} alt="Sora logo" class="size-11" />
		</a>

		<ul
			class="mr-auto flex h-full max-[60rem]:group-has-[[role=search]>div:not([inert])]/nav:hidden max-sm:hidden"
		>
			{#each sections as section (section.href)}
				<li class="max-lg:hidden">
					<a
						href={section.href}
						class="inline-flex h-full items-center px-4 text-sm font-medium text-muted transition-colors hover:bg-header-hover hover:text-foreground"
						aria-current={page.url.pathname === section.href ? "page" : undefined}
					>
						{section.label}
					</a>
				</li>
			{/each}
			<li
				class="h-full [&_.dropdown-root]:h-full [&_.dropdown-trigger]:h-full [&_.dropdown-trigger]:px-4 [&_.dropdown-trigger]:text-sm [&_.dropdown-trigger]:font-medium [&_.dropdown-trigger]:tracking-normal [&_.dropdown-trigger]:normal-case [&_.dropdown-trigger]:hover:bg-header-hover has-[.dropdown-menu:popover-open]:[&_.dropdown-trigger]:bg-header-hover"
			>
				<Dropdown
					alignment="left"
					class="w-[min(48rem,calc(100vw-2rem))] bg-header-hover open:flex-row"
				>
					{#snippet trigger()}
						Categories
						<CaretDownIcon size="1rem" weight="fill" />
					{/snippet}

					{#snippet children()}
						<ul class="w-56 shrink-0 border-r border-border">
							{#each categories as section (section.href)}
								<li>
									<Button
										href={section.href}
										variant="item"
										class="text-[0.9375rem] aria-[current=page]:font-normal aria-[current=page]:text-accent"
										aria-current={page.url.pathname === section.href ? "page" : undefined}
									>
										{section.label}
									</Button>
								</li>
							{/each}
						</ul>
						<section class="min-w-0 flex-1" aria-labelledby="header-genres">
							<h2
								id="header-genres"
								class="px-5 pt-4 pb-2 text-xs font-bold tracking-wide text-muted uppercase"
							>
								Genres
							</h2>
							<ul class="grid grid-cols-2 lg:grid-cols-3">
								{#each genres as genre (genre)}
									<li>
										<Button
											href="/genres/{genreSlug(genre)}"
											variant="item"
											class="text-[0.9375rem] aria-[current=page]:font-normal aria-[current=page]:text-accent"
											aria-current={page.params.genre === genreSlug(genre) ? "page" : undefined}
										>
											{genre}
										</Button>
									</li>
								{/each}
							</ul>
						</section>
					{/snippet}
				</Dropdown>
			</li>
		</ul>

		<div class="flex h-full items-center">
			<Search />

			<a
				href="/watchlist"
				class="relative inline-flex h-full w-12 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground max-sm:hidden sm:w-14"
				aria-label="Watchlist"
				aria-current={page.url.pathname === "/watchlist" ? "page" : undefined}
			>
				<BookmarkSimpleIcon size="1.5rem" />
			</a>

			<div
				class="h-full [&_.dropdown-root]:h-full [&_.dropdown-trigger]:h-full [&_.dropdown-trigger]:gap-1 [&_.dropdown-trigger]:px-3 [&_.dropdown-trigger]:hover:bg-header-hover has-[.dropdown-menu:popover-open]:[&_.dropdown-trigger]:bg-header-hover"
			>
				<Dropdown
					class="w-[min(21rem,calc(100vw-1rem))] bg-header-hover"
					label="Account menu for {profile.name}"
				>
					{#snippet trigger()}
						<Avatar avatar={profile.avatar} alt="Avatar of {profile.name}" class="size-8" />
						<CaretDownIcon size="1rem" weight="fill" />
					{/snippet}

					{#snippet children()}
						<div role="menu" aria-label="Account">
							<Button
								role="menuitem"
								href="/profiles/{profile.id}"
								variant="item"
								class="min-h-14 gap-3 py-2"
								aria-label="Edit profile {profile.name}"
							>
								<Avatar avatar={profile.avatar} alt="Avatar of {profile.name}" class="size-9" />
								<span class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
									{profile.name}
								</span>
								<PencilSimpleIcon size="1.1rem" class="text-muted" />
							</Button>

							{#each others as other (other.id)}
								<Button
									role="menuitem"
									type="submit"
									form="switch-profile"
									name="profile"
									value={other.id}
									aria-label="Switch to {other.name}"
									variant="item"
									class="gap-3"
								>
									<Avatar avatar={other.avatar} alt="Avatar of {other.name}" class="size-7" />
									{other.name}
								</Button>
							{/each}

							<Button
								role="menuitem"
								href="/profiles"
								variant="item"
								class="gap-3"
								onclick={() => (profilesPage.managing = true)}
							>
								<UsersIcon size="1.3rem" />
								Manage profiles
							</Button>

							<Button
								role="menuitem"
								type="submit"
								form="sign-out"
								variant="item"
								class="gap-3 border-t border-border"
							>
								<SignOutIcon size="1.3rem" />
								Sign out
							</Button>
						</div>
					{/snippet}
				</Dropdown>
			</div>
		</div>
	</nav>

	<form id="switch-profile" method="POST" action="/profiles?/select&redirect={here}" hidden></form>
	<form id="sign-out" method="POST" action="/logout" hidden></form>
</header>
