<script lang="ts">
	import { page } from "$app/state";
	import logo from "$lib/assets/logo.png";
	import { getGenres } from "$lib/catalog.remote";
	import Avatar from "$lib/components/ui/Avatar.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import { getUnreadNotifications } from "$lib/notifications.remote";
	import { cn, pollWhileVisible } from "$lib/utils";
	import { profilesPage } from "$routes/(auth)/profiles/profiles.svelte";
	import type { Profile } from "@sora/sdk";
	import {
		BellSimpleIcon,
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
	const unreadQuery = getUnreadNotifications();
	const unread = $derived(unreadQuery.current ?? 0);
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

	$effect(() => pollWhileVisible(() => unreadQuery.refresh()));
</script>

<header class="fixed inset-x-0 top-0 z-50 h-14 bg-header backdrop-blur">
	<nav class="group/nav flex h-full items-center justify-end" aria-label="Primary">
		<div class="h-full sm:hidden">
			<Dropdown
				variant="icon"
				alignment="left"
				class="mobile-menu fixed! top-14! bottom-0! left-0! h-auto w-full gap-0 overflow-y-auto bg-header-hover"
				label="Menu"
			>
				{#snippet trigger()}
					<ListIcon size="1.5rem" />
				{/snippet}

				{#snippet children()}
					<ul class="flex flex-col">
						{#each categories as section (section.href)}
							<li>
								<Button
									href={section.href}
									variant="item"
									class="border-l-3 border-transparent px-4 text-base aria-[current=page]:border-accent aria-[current=page]:font-normal aria-[current=page]:text-accent"
									aria-current={page.url.pathname === section.href ? "page" : undefined}
								>
									{section.href === "/simulcast" ? "Simulcast Season" : section.label}
								</Button>
							</li>
						{/each}
						<li>
							<Button
								variant="item"
								class="justify-between text-base aria-expanded:text-foreground"
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
								<ul id="menu-genres" class="bg-tooltip/50">
									{#each genres as genre (genre)}
										{@const slug = genre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
										<li>
											<Button
												href="/genres/{slug}"
												variant="item"
												class="border-l-3 border-transparent pl-9 text-base aria-[current=page]:border-accent aria-[current=page]:font-normal aria-[current=page]:text-accent"
												aria-current={page.params.genre === slug ? "page" : undefined}
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
			<li class="h-full">
				<Dropdown
					variant="link"
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
										class="text-base aria-[current=page]:font-normal aria-[current=page]:text-accent"
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
									{@const slug = genre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
									<li>
										<Button
											href="/genres/{slug}"
											variant="item"
											class="text-base aria-[current=page]:font-normal aria-[current=page]:text-accent"
											aria-current={page.params.genre === slug ? "page" : undefined}
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

			<a
				href="/notifications"
				class={cn(
					"relative inline-flex h-full w-12 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground max-sm:hidden sm:w-14",
					unread > 0 &&
						"after:absolute after:top-3.5 after:right-3 after:size-2 after:bg-status-error after:ring-2 after:ring-header sm:after:right-4",
				)}
				aria-label={unread > 0 ? "Notifications, new notifications" : "Notifications"}
				aria-current={page.url.pathname === "/notifications" ? "page" : undefined}
			>
				<BellSimpleIcon size="1.5rem" />
			</a>

			<div class="h-full">
				<Dropdown
					variant="bar"
					class="mobile-menu w-[min(21rem,calc(100vw-1rem))] bg-header-hover max-sm:fixed! max-sm:inset-x-0! max-sm:top-14! max-sm:bottom-0! max-sm:h-[calc(100dvh-3.5rem)] max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:overflow-hidden"
					label={unread > 0
						? `Account menu for ${profile.name}, new notifications`
						: `Account menu for ${profile.name}`}
				>
					{#snippet trigger()}
						<Avatar avatar={profile.avatar} alt="Avatar of {profile.name}" class="size-8" />
						<CaretDownIcon size="1rem" weight="fill" />
					{/snippet}

					{#snippet children()}
						<div
							role="menu"
							aria-label="Account"
							class="max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col"
						>
							<div
								class="max-sm:min-h-0 max-sm:flex-1 max-sm:overflow-y-auto max-sm:overscroll-contain"
							>
								<Button
									role="menuitem"
									href="/profiles/{profile.id}"
									variant="item"
									class="min-h-14 gap-3 py-2 max-sm:min-h-22 max-sm:gap-4 max-sm:py-4"
									aria-label="Edit profile {profile.name}"
								>
									<Avatar
										avatar={profile.avatar}
										alt="Avatar of {profile.name}"
										class="size-9 max-sm:size-14"
									/>
									<span
										class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground max-sm:text-lg"
									>
										{profile.name}
									</span>
									<PencilSimpleIcon size="1.1rem" class="text-muted max-sm:size-6" />
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
										class="gap-3 max-sm:min-h-14 max-sm:gap-4 max-sm:py-4 max-sm:text-base"
									>
										<Avatar avatar={other.avatar} alt="Avatar of {other.name}" class="size-7" />
										{other.name}
									</Button>
								{/each}

								<Button
									role="menuitem"
									href="/profiles"
									variant="item"
									class="gap-3 max-sm:min-h-14 max-sm:gap-4 max-sm:py-4 max-sm:text-base"
									onclick={() => (profilesPage.managing = true)}
								>
									<UsersIcon size="1.3rem" class="max-sm:size-6" />
									Manage profiles
								</Button>
								<Button
									role="menuitem"
									href="/watchlist"
									variant="item"
									class="min-h-14 gap-4 py-4 text-base sm:hidden"
									aria-current={page.url.pathname === "/watchlist" ? "page" : undefined}
								>
									<BookmarkSimpleIcon size="1.5rem" />
									Watch List
								</Button>
								<Button
									role="menuitem"
									href="/notifications"
									variant="item"
									class={cn(
										"min-h-14 gap-4 py-4 text-base sm:hidden",
										unread > 0 && "after:size-2 after:bg-status-error",
									)}
									aria-current={page.url.pathname === "/notifications" ? "page" : undefined}
								>
									<BellSimpleIcon size="1.5rem" />
									Notifications
									{#if unread > 0}<span class="sr-only">, new notifications</span>{/if}
								</Button>
							</div>

							<Button
								role="menuitem"
								type="submit"
								form="sign-out"
								variant="item"
								class="gap-3 max-sm:sticky max-sm:bottom-0 max-sm:min-h-14 max-sm:gap-4 max-sm:bg-header-hover max-sm:pt-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] max-sm:text-base"
							>
								<SignOutIcon size="1.3rem" class="max-sm:size-6" />
								<span class="sm:hidden">Log Out</span>
								<span class="max-sm:hidden">Sign out</span>
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
