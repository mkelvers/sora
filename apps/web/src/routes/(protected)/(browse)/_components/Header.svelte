<script lang="ts">
	import { page } from '$app/state';
	import {
		CaretDownIcon,
		PencilSimpleIcon,
		SignOutIcon,
		UsersIcon,
	} from 'phosphor-svelte';
	import type { Profile } from '@sora/sdk';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Dropdown from '$lib/components/ui/Dropdown.svelte';
	import { cn } from '$lib/utils';
	import Search from './Search.svelte';

	let {
		profile,
		profiles,
	}: {
		profile: Profile;
		profiles: Profile[];
	} = $props();

	const others = $derived(profiles.filter((other) => other.id !== profile.id));
	const here = $derived(encodeURIComponent(page.url.pathname + page.url.search));
	const link =
		'inline-flex h-full w-12 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground sm:w-14';
	const item =
		'flex min-h-12 w-full items-center justify-start gap-3 px-5 text-left text-sm text-muted transition-colors hover:bg-header hover:text-foreground focus-visible:bg-header focus-visible:text-foreground focus-visible:outline-none';
</script>

<header class="fixed inset-x-0 top-0 z-50 h-14 bg-header backdrop-blur">
	<nav class="flex h-full items-center justify-end pl-3 md:pl-6" aria-label="Primary">
		<div class="flex h-full items-center">
			<Search />

			<div
				class="h-full [&_.dropdown-root]:h-full [&_.dropdown-trigger]:h-full [&_.dropdown-trigger]:gap-1 [&_.dropdown-trigger]:px-3 [&_.dropdown-trigger]:hover:bg-header-hover has-[.dropdown-menu:popover-open]:[&_.dropdown-trigger]:bg-header-hover"
			>
				<Dropdown id="account-menu" className="w-[min(21rem,calc(100vw-1rem))] bg-header-hover *:p-0">
					{#snippet trigger()}
						<Avatar seed={profile.avatar} class="size-8" />
						<CaretDownIcon size="1rem" weight="fill" />
					{/snippet}

					{#snippet children()}
						<div role="dialog" aria-label="Account">
							<a
								href="/profiles/{profile.id}"
								class="flex min-h-14 items-center gap-3 px-5 py-2 transition-colors hover:bg-header"
							>
								<Avatar seed={profile.avatar} class="size-9" />
								<span class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
									{profile.name}
								</span>
								<PencilSimpleIcon size="1.1rem" class="text-muted" />
							</a>

							{#each others as other (other.id)}
								<Button type="submit" form="switch-profile" name="profile" value={other.id} class={item}>
									<Avatar seed={other.avatar} class="size-7" />
									{other.name}
								</Button>
							{/each}

							<a href="/profiles?manage=1" class={item}>
								<UsersIcon size="1.3rem" />
								Manage profiles
							</a>

							<Button type="submit" form="sign-out" class={cn(item, 'min-h-14')}>
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
