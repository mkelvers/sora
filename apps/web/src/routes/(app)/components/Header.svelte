<script lang="ts">
	import { page } from "$app/state";
	import logo from "$lib/assets/logo.png";
	import Avatar from "$lib/components/ui/Avatar.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import { cn, pollWhileVisible } from "$lib/utils";
	import { getGenres } from "$routes/(app)/(catalog)/catalog.remote";
	import { slug } from "$routes/(app)/(catalog)/genres/slug";
	import { getUnreadNotifications } from "$routes/(app)/notifications/notifications.remote";
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

	const unread = getUnreadNotifications();
	const genres = getGenres();

	let categories = $state(false);

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
			long: "Simulcast season",
		},
	];

	const links = [
		...sections,
		{
			href: "/calendar",
			label: "Release Calendar",
		},
	];

	function current(href: string) {
		return page.url.pathname === href ? "page" : undefined;
	}

	$effect(() => pollWhileVisible(() => unread.refresh()));
</script>

<header class="fixed inset-x-0 top-0 z-50 h-14 bg-raised">
	<nav class="group/nav flex h-full items-center justify-end" aria-label="Primary">
		<div class="h-full sm:hidden">
			<Dropdown
				variant="nav"
				square
				alignment="left"
				class="mobile-menu fixed! top-14! bottom-0! left-0! h-auto w-full overflow-y-auto bg-surface"
				label="Menu"
			>
				{#snippet trigger()}
					<ListIcon size="1.5rem" />
				{/snippet}

				{#snippet children()}
					<ul class="flex flex-col">
						{#each links as section (section.href)}
							<li>
								<Button href={section.href} variant="item" aria-current={current(section.href)}>
									{"long" in section ? section.long : section.label}
								</Button>
							</li>
						{/each}
						<li>
							<Button
								variant="item"
								class="justify-between"
								aria-expanded={categories}
								aria-controls="menu-genres"
								onclick={(event: MouseEvent) => {
									event.stopPropagation();
									categories = !categories;
								}}
							>
								Categories
								<CaretDownIcon
									size="1rem"
									weight="fill"
									class={cn("transition-transform", categories && "rotate-180")}
								/>
							</Button>
							{#if categories}
								<ul id="menu-genres">
									{#each genres.current ?? [] as genre (genre)}
										<li>
											<Button
												href="/genres/{slug(genre)}"
												variant="item"
												class="pl-9"
												aria-current={current(`/genres/${slug(genre)}`)}
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
			class="inline-flex h-full items-center px-1 focus-visible:-outline-offset-2 max-[60rem]:group-has-[[role=search]>button[aria-expanded=true]]/nav:mr-auto max-sm:mr-auto sm:px-3"
			aria-label="Home"
			aria-current={current("/")}
		>
			<img src={logo} alt="Sora logo" width="160" height="160" class="size-11" />
		</a>

		<ul
			class="mr-auto flex h-full max-[60rem]:group-has-[[role=search]>button[aria-expanded=true]]/nav:hidden max-sm:hidden"
		>
			{#each sections as section (section.href)}
				<li class="max-lg:hidden">
					<Button href={section.href} variant="nav" aria-current={current(section.href)}>
						{section.label}
					</Button>
				</li>
			{/each}
			<li class="h-full">
				<Dropdown
					variant="nav"
					alignment="left"
					class="w-[min(48rem,calc(100vw-2rem))] bg-surface open:flex-row"
				>
					{#snippet trigger()}
						Categories
						<CaretDownIcon size="1rem" weight="fill" />
					{/snippet}

					{#snippet children()}
						<ul class="w-56 shrink-0 py-2">
							{#each links as section (section.href)}
								<li>
									<Button href={section.href} variant="item" aria-current={current(section.href)}>
										{section.label}
									</Button>
								</li>
							{/each}
						</ul>
						<section class="min-w-0 flex-1 py-2" aria-labelledby="header-genres">
							<h2 id="header-genres" class="px-5 pt-2 pb-1 text-sm text-subtle">Genres</h2>
							<ul class="grid grid-cols-2 lg:grid-cols-3">
								{#each genres.current ?? [] as genre (genre)}
									<li>
										<Button
											href="/genres/{slug(genre)}"
											variant="item"
											aria-current={current(`/genres/${slug(genre)}`)}
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

			<Button
				href="/watchlist"
				variant="nav"
				square
				class="max-sm:hidden"
				aria-label="Watchlist"
				aria-current={current("/watchlist")}
			>
				<BookmarkSimpleIcon size="1.5rem" />
			</Button>

			<Button
				href="/notifications"
				variant="nav"
				square
				class={cn(
					"relative max-sm:hidden",
					unread.current &&
						"after:absolute after:top-3.5 after:right-4 after:size-2 after:rounded-full after:bg-danger",
				)}
				aria-label={unread.current ? "Notifications, new notifications" : "Notifications"}
				aria-current={current("/notifications")}
			>
				<BellSimpleIcon size="1.5rem" />
			</Button>

			<div class="h-full">
				<Dropdown
					variant="nav"
					class="mobile-menu w-[min(21rem,calc(100vw-1rem))] bg-surface max-sm:fixed! max-sm:inset-x-0! max-sm:top-14! max-sm:bottom-0! max-sm:h-[calc(100dvh-3.5rem)] max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:overflow-hidden"
					label={unread.current
						? `Account menu for ${profile.name}, new notifications`
						: `Account menu for ${profile.name}`}
				>
					{#snippet trigger()}
						<Avatar avatar={profile.avatar} alt="Avatar of {profile.name}" class="size-8" />
						<CaretDownIcon size="1rem" weight="fill" />
					{/snippet}

					{#snippet children()}
						<div
							role="group"
							aria-label="Account"
							class="max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col"
						>
							<div
								class="max-sm:min-h-0 max-sm:flex-1 max-sm:overflow-y-auto max-sm:overscroll-contain"
							>
								<Button
									href="/profiles/{profile.id}"
									variant="item"
									class="gap-3"
									aria-label="Edit profile {profile.name}"
								>
									<Avatar avatar={profile.avatar} alt="Avatar of {profile.name}" class="size-9" />
									<span class="min-w-0 flex-1 truncate font-bold text-foreground">
										{profile.name}
									</span>
									<PencilSimpleIcon size="1.25rem" />
								</Button>

								<form
									class="contents"
									method="POST"
									action="/profiles?/select&redirect={encodeURIComponent(
										page.url.pathname + page.url.search,
									)}"
								>
									{#each profiles.filter((other) => other.id !== profile.id) as other (other.id)}
										<Button
											type="submit"
											name="profile"
											value={other.id}
											aria-label="Switch to {other.name}"
											variant="item"
											class="gap-3"
										>
											<Avatar avatar={other.avatar} alt="Avatar of {other.name}" class="size-9" />
											{other.name}
										</Button>
									{/each}
								</form>

								<Button
									href="/profiles"
									variant="item"
									class="gap-3"
									onclick={() => (profilesPage.managing = true)}
								>
									<UsersIcon size="1.25rem" />
									Manage profiles
								</Button>
								<Button
									href="/watchlist"
									variant="item"
									class="gap-3 sm:hidden"
									aria-current={current("/watchlist")}
								>
									<BookmarkSimpleIcon size="1.25rem" />
									Watchlist
								</Button>
								<Button
									href="/notifications"
									variant="item"
									class={cn(
										"gap-3 sm:hidden",
										unread.current && "after:size-2 after:rounded-full after:bg-danger",
									)}
									aria-current={current("/notifications")}
								>
									<BellSimpleIcon size="1.25rem" />
									Notifications
									{#if unread.current}<span class="sr-only">, new notifications</span>{/if}
								</Button>
							</div>

							<form class="contents" method="POST" action="/logout">
								<Button
									type="submit"
									variant="item"
									class="gap-3 max-sm:sticky max-sm:bottom-0 max-sm:bg-surface max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
								>
									<SignOutIcon size="1.25rem" />
									Sign out
								</Button>
							</form>
						</div>
					{/snippet}
				</Dropdown>
			</div>
		</div>
	</nav>
</header>
