<script lang="ts">
	import { page } from "$app/state";
	import logo from "$lib/assets/logo.png";
	import Avatar from "$lib/components/ui/Avatar.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import { cn } from "$lib/utils";
	import type { Profile } from "@sora/sdk";
	import {
		BellSimpleIcon,
		BookmarkSimpleIcon,
		CaretDownIcon,
		HouseSimpleIcon,
		ListIcon,
		PencilSimpleIcon,
		SignOutIcon,
		UsersIcon,
	} from "phosphor-svelte";

	import { profilesPage } from "../../profiles/profiles.svelte";
	import { getUnreadNotifications } from "../home.remote";
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

	const destinations = $derived([
		{
			href: "/",
			label: "Home",
			icon: HouseSimpleIcon,
			new: false,
		},
		{
			href: "/watchlist",
			label: "Watchlist",
			icon: BookmarkSimpleIcon,
			new: false,
		},
		{
			href: "/notifications",
			label: "Notifications",
			icon: BellSimpleIcon,
			new: unread > 0,
		},
	]);

	$effect(() => {
		const check = () => {
			if (document.visibilityState === "visible") {
				unreadQuery.refresh();
			}
		};
		const timer = setInterval(check, 30_000);
		document.addEventListener("visibilitychange", check);

		return () => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", check);
		};
	});
</script>

<header class="fixed inset-x-0 top-0 z-50 h-14 bg-header backdrop-blur">
	<nav class="flex h-full items-center justify-end" aria-label="Primary">
		<div
			class={cn(
				"h-full sm:hidden [&_.dropdown-root]:h-full [&_.dropdown-trigger]:relative [&_.dropdown-trigger]:h-full [&_.dropdown-trigger]:w-12 [&_.dropdown-trigger]:justify-center [&_.dropdown-trigger]:p-0 [&_.dropdown-trigger]:text-muted [&_.dropdown-trigger]:hover:bg-header-hover [&_.dropdown-trigger]:hover:text-foreground has-[.dropdown-menu:popover-open]:[&_.dropdown-trigger]:bg-header-hover has-[.dropdown-menu:popover-open]:[&_.dropdown-trigger]:text-foreground",
				unread > 0 &&
					"[&_.dropdown-trigger]:after:absolute [&_.dropdown-trigger]:after:top-3.5 [&_.dropdown-trigger]:after:right-2.5 [&_.dropdown-trigger]:after:size-2 [&_.dropdown-trigger]:after:rounded-full [&_.dropdown-trigger]:after:bg-status-error [&_.dropdown-trigger]:after:ring-2 [&_.dropdown-trigger]:after:ring-header",
			)}
		>
			<Dropdown
				alignment="left"
				class="mobile-menu fixed! top-14! bottom-0! left-0! h-auto w-full gap-0 bg-header-hover"
				label={unread > 0 ? "Menu, new notifications" : "Menu"}
			>
				{#snippet trigger()}
					<ListIcon size="1.5rem" />
				{/snippet}

				{#snippet children()}
					<ul class="flex flex-col">
						{#each destinations as destination (destination.href)}
							<li>
								<Button
									href={destination.href}
									variant="item"
									class={cn(
										"text-[0.9375rem]",
										destination.new &&
											"after:ml-2.5 after:size-2 after:rounded-full after:bg-status-error",
									)}
									aria-current={page.url.pathname === destination.href ? "page" : undefined}
								>
									{destination.label}
									{#if destination.new}<span class="sr-only">, new notifications</span>{/if}
								</Button>
							</li>
						{/each}
					</ul>
				{/snippet}
			</Dropdown>
		</div>

		<a
			href="/"
			class="mr-auto inline-flex h-full items-center px-1 sm:px-3"
			aria-label="Home"
			aria-current={page.url.pathname === "/" ? "page" : undefined}
		>
			<img src={logo} alt="Sora logo" class="size-11" />
		</a>

		<div class="flex h-full items-center">
			<Search />

			{#each destinations.filter((destination) => destination.href !== "/") as destination (destination.href)}
				<a
					href={destination.href}
					class={cn(
						"relative inline-flex h-full w-12 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground max-sm:hidden sm:w-14",
						page.url.pathname === destination.href && "bg-header-hover text-foreground",
						destination.new &&
							"after:absolute after:top-3.5 after:right-3 after:size-2 after:rounded-full after:bg-status-error after:ring-2 after:ring-header sm:after:right-4",
					)}
					aria-label={destination.new
						? `${destination.label}, new notifications`
						: destination.label}
					aria-current={page.url.pathname === destination.href ? "page" : undefined}
				>
					<destination.icon size="1.5rem" />
				</a>
			{/each}

			<div
				class="h-full [&_.dropdown-root]:h-full [&_.dropdown-trigger]:h-full [&_.dropdown-trigger]:gap-1 [&_.dropdown-trigger]:px-3 [&_.dropdown-trigger]:hover:bg-header-hover has-[.dropdown-menu:popover-open]:[&_.dropdown-trigger]:bg-header-hover"
			>
				<Dropdown class="w-[min(21rem,calc(100vw-1rem))] bg-header-hover">
					{#snippet trigger()}
						<Avatar avatar={profile.avatar} alt="Avatar of {profile.name}" class="size-8" />
						<CaretDownIcon size="1rem" weight="fill" />
					{/snippet}

					{#snippet children()}
						<div role="dialog" aria-label="Account">
							<Button
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
								href="/profiles"
								variant="item"
								class="gap-3"
								onclick={() => (profilesPage.managing = true)}
							>
								<UsersIcon size="1.3rem" />
								Manage profiles
							</Button>

							<Button type="submit" form="sign-out" variant="item" class="gap-3">
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
