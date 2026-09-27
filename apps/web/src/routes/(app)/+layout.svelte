<script lang="ts">
    import { navigating, page } from '$app/state';
    import { GearIcon, ListIcon, PencilSimpleIcon, SignOutIcon, UsersIcon } from 'phosphor-svelte';
    import { m } from '$lib/i18n.svelte';
    import Avatar from '$lib/components/ui/Avatar.svelte';
    import Logo from '$lib/components/ui/Logo.svelte';
    import Button from '$lib/components/ui/button/Button.svelte';
    import Dropdown from '$lib/components/ui/dropdown/Dropdown.svelte';
    import { cn } from '$lib/utils';
    import Spinner from '$lib/components/ui/Spinner.svelte';
    import type { LayoutProps } from './$types';

    let { data, children }: LayoutProps = $props();

    const others = $derived(data.profiles.filter((other) => other.id !== data.profile.id));
    const here = $derived(encodeURIComponent(page.url.pathname + page.url.search));
</script>

<svelte:head>
    <link rel="canonical" href={data.canonical} />
    <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<header class="fixed inset-x-0 top-0 z-50 h-14 bg-header backdrop-blur">
    <nav class="flex h-full items-center justify-between pl-3 md:pl-6" aria-label={m.nav_primary()}>
        <div class="flex h-full items-center max-sm:pl-12">
            <div class="flex h-full items-center gap-2">
                <a
                    href="/"
                    class="inline-flex h-12 items-center justify-center text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label={m.nav_home()}
                    title={m.nav_home()}
                >
                    <Logo alt="Sora" class="transition-colors hover:text-white" />
                </a>

                <a
                    href="/shows/new"
                    class="hidden h-full items-center justify-center px-4 text-sm font-medium text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
                >
                    {m.nav_new()}
                </a>
            </div>

            <a
                href="/shows/popular"
                class="hidden h-full items-center justify-center px-4 text-sm font-medium text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
            >
                {m.nav_popular()}
            </a>

            <a
                href="/simulcast"
                class="hidden h-full items-center justify-center px-4 text-sm font-medium text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
            >
                {m.nav_simulcast()}
            </a>

            <div
                class="flex h-full [&_.dropdown-trigger]:hidden [&_.dropdown-trigger]:h-full [&_.dropdown-trigger]:items-center [&_.dropdown-trigger]:justify-center [&_.dropdown-trigger]:gap-2 [&_.dropdown-trigger]:py-0 [&_.dropdown-trigger]:px-4 [&_.dropdown-trigger]:text-sm [&_.dropdown-trigger]:font-medium [&_.dropdown-trigger]:normal-case [&_.dropdown-trigger]:tracking-normal [&_.dropdown-trigger]:text-muted [&_.dropdown-trigger]:transition-colors [&_.dropdown-trigger]:hover:bg-header-hover [&_.dropdown-trigger]:hover:text-foreground [&_.dropdown-trigger]:focus-visible:outline-2 [&_.dropdown-trigger]:focus-visible:outline-offset-2 [&_.dropdown-trigger]:focus-visible:outline-accent [&_.dropdown-root:has(.dropdown-menu:popover-open)_.dropdown-trigger]:bg-header-hover [&_.dropdown-root:has(.dropdown-menu:popover-open)_.dropdown-trigger]:text-foreground sm:[&_.dropdown-trigger]:inline-flex"
            >
                <Dropdown
                    id="categories-menu"
                    alignment="left"
                    className="w-[min(52rem,calc(100vw-2rem))] bg-header-hover *:p-0"
                >
                    {#snippet trigger()}
                        <span>Categories</span>
                        <svg
                            class="header-svg-icon size-6 fill-current"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            data-t="dropdown-svg"
                            aria-hidden="true"
                            role="img"
                        >
                            <path d="M7 10h10l-5 5z"></path>
                        </svg>
                    {/snippet}
                    {#snippet children()}
                        <div role="dialog" aria-label="Categories">
                            <div class="grid grid-cols-[minmax(12rem,1fr)_minmax(0,2fr)]">
                                <div>
                                    <a
                                        href="/shows/new"
                                        onclick={(event) =>
                                            (
                                                event.currentTarget.closest('[popover]') as HTMLElement | null
                                            )?.hidePopover()}
                                        class="block px-5 py-3 text-sm text-muted hover:bg-panel hover:text-foreground focus:bg-panel focus:text-foreground focus:outline-none"
                                    >
                                        {m.nav_new()}
                                    </a>
                                    <a
                                        href="/shows/popular"
                                        onclick={(event) =>
                                            (
                                                event.currentTarget.closest('[popover]') as HTMLElement | null
                                            )?.hidePopover()}
                                        class="block px-5 py-3 text-sm text-muted hover:bg-panel hover:text-foreground focus:bg-panel focus:text-foreground focus:outline-none"
                                    >
                                        {m.nav_popular()}
                                    </a>
                                    <a
                                        href="/simulcast"
                                        onclick={(event) =>
                                            (
                                                event.currentTarget.closest('[popover]') as HTMLElement | null
                                            )?.hidePopover()}
                                        class="block px-5 py-3 text-sm text-muted hover:bg-panel hover:text-foreground focus:bg-panel focus:text-foreground focus:outline-none"
                                    >
                                        {m.nav_simulcast()}
                                    </a>
                                    <a
                                        href="/release-calendar"
                                        onclick={(event) =>
                                            (
                                                event.currentTarget.closest('[popover]') as HTMLElement | null
                                            )?.hidePopover()}
                                        class="block px-5 py-3 text-sm text-muted hover:bg-panel hover:text-foreground focus:bg-panel focus:text-foreground focus:outline-none"
                                    >
                                        {m.nav_release_calendar()}
                                    </a>
                                </div>
                                <div class="min-w-0 border-l border-border py-5">
                                    <p class="mb-3 px-5 text-xs font-bold tracking-wide text-muted uppercase">
                                        Genres
                                    </p>
                                    <div class="grid grid-cols-3">
                                        {#each data.genres as genre}
                                            <a
                                                href={`/category/${genre.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}
                                                onclick={(event) =>
                                                    (
                                                        event.currentTarget.closest(
                                                            '[popover]'
                                                        ) as HTMLElement | null
                                                    )?.hidePopover()}
                                                class="flex min-h-11 items-center px-5 text-sm text-muted transition-colors hover:bg-panel hover:text-foreground focus:bg-panel focus:text-foreground focus:outline-none"
                                            >
                                                {genre}
                                            </a>
                                        {/each}
                                    </div>
                                </div>
                            </div>
                        </div>
                    {/snippet}
                </Dropdown>
            </div>
        </div>

        <div class="hidden h-full items-center sm:flex">
            <a
                href="/search"
                class="inline-flex h-full w-11 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-14"
                aria-label={m.nav_search()}
                title={m.nav_search()}
            >
                <svg
                    class="header-svg-icon size-6 fill-current"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    data-t="search-svg"
                    aria-hidden="true"
                    role="img"
                >
                    <path
                        fill-rule="evenodd"
                        clip-rule="evenodd"
                        d="M10.5 19C12.4879 19 14.3164 18.3176 15.7641 17.1742L21.2927 22.7069L22.7074 21.2931L17.1778 15.7595C18.319 14.3126 19 12.4858 19 10.5C19 5.80558 15.1944 2 10.5 2C5.80558 2 2 5.80558 2 10.5C2 15.1944 5.80558 19 10.5 19ZM10.5 17C14.0899 17 17 14.0899 17 10.5C17 6.91015 14.0899 4 10.5 4C6.91015 4 4 6.91015 4 10.5C4 14.0899 6.91015 17 10.5 17Z"
                    ></path>
                </svg>
            </a>

            <a
                href="/watchlist"
                class="inline-flex h-full w-11 items-center justify-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-14"
                aria-label={m.nav_watchlist()}
                title={m.nav_watchlist()}
            >
                <svg
                    class="header-svg-icon size-6 fill-current"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    data-t="watchlist-svg"
                    aria-hidden="true"
                    role="img"
                >
                    <path
                        fill-rule="evenodd"
                        clip-rule="evenodd"
                        d="M19.0001 20.5858C19.0001 21.4767 17.9229 21.9229 17.293 21.2929L12.0001 16L6.7071 21.2929C6.07714 21.9229 5 21.4767 5 20.5858L5.00006 3H19.0001V20.5858ZM7.00001 18.1716L7.00006 5H17.0001V18.1716L12.0001 13.1716L7.00001 18.1716Z"
                    ></path>
                </svg>
            </a>

            <div
                class="h-full [&_.dropdown-root]:h-full [&_.dropdown-trigger]:h-full [&_.dropdown-trigger]:hover:bg-header-hover"
            >
                <Dropdown id="account-menu" className="w-[min(21rem,calc(100vw-1rem))] bg-header-hover *:p-0">
                    {#snippet trigger()}
                        <Avatar seed={data.profile.avatar} class="size-8" />
                        <svg
                            class="header-svg-icon size-6 fill-current"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            role="img"
                        >
                            <path d="M7 10h10l-5 5z"></path>
                        </svg>
                    {/snippet}

                    {#snippet children()}
                        <div role="dialog" aria-label={m.nav_account_menu()}>
                            <a
                                href="/profiles/{data.profile.id}"
                                class="flex min-h-20 items-center gap-3 bg-header-hover px-5 py-3 transition-colors hover:bg-header"
                            >
                                <Avatar seed={data.profile.avatar} class="size-11" />
                                <span class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                                    {data.profile.name}
                                </span>
                                <PencilSimpleIcon size={18} class="text-muted" aria-hidden="true" />
                            </a>

                            {#each others as other (other.id)}
                                <Button
                                    type="submit"
                                    form="switch-profile"
                                    name="profile"
                                    value={other.id}
                                    class="flex min-h-12 w-full items-center justify-start gap-3 px-5 text-left text-sm text-muted transition-colors hover:bg-header hover:text-foreground focus-visible:bg-header focus-visible:text-foreground focus-visible:outline-none"
                                >
                                    <Avatar seed={other.avatar} class="size-7" />
                                    <span>{other.name}</span>
                                </Button>
                            {/each}

                            <a
                                href="/profiles?manage=1"
                                class="flex min-h-12 w-full items-center gap-3 px-5 text-sm text-muted transition-colors hover:bg-header hover:text-foreground focus-visible:bg-header focus-visible:text-foreground focus-visible:outline-none"
                            >
                                <UsersIcon size={21} aria-hidden="true" />
                                <span>Manage profiles</span>
                            </a>

                            <a
                                href="/settings"
                                class="flex min-h-12 w-full items-center gap-3 px-5 text-sm text-muted transition-colors hover:bg-header hover:text-foreground focus-visible:bg-header focus-visible:text-foreground focus-visible:outline-none"
                            >
                                <GearIcon size={21} aria-hidden="true" />
                                <span>{m.nav_settings()}</span>
                            </a>

                            <Button
                                type="submit"
                                form="sign-out"
                                class="flex min-h-14 w-full items-center justify-start gap-3 px-5 text-left text-sm text-muted transition-colors hover:bg-header hover:text-foreground focus-visible:bg-header focus-visible:text-foreground focus-visible:outline-none"
                            >
                                <SignOutIcon size={21} aria-hidden="true" />
                                <span>{m.nav_logout()}</span>
                            </Button>
                        </div>
                    {/snippet}
                </Dropdown>
            </div>
        </div>

        <div class="pointer-events-none absolute inset-x-0 top-0 flex h-14 items-center justify-between sm:hidden">
            <Dropdown
                id="mobile-navigation"
                className="fixed top-14 right-0 bottom-0 left-0 z-50 h-[calc(100dvh-3.5rem)] w-screen pointer-events-auto overflow-y-auto overscroll-contain bg-header-hover *:p-0"
            >
                {#snippet trigger()}
                    <span class="sr-only">{m.nav_open_navigation()}</span>
                    <ListIcon size={24} aria-hidden="true" />
                {/snippet}

                {#snippet children()}
                    <div role="dialog">
                        <nav class="bg-header-hover px-0" aria-label={m.nav_primary()}>
                            <a
                                href="/shows/new"
                                class="block px-5 py-3 text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            >
                                {m.nav_new()}
                            </a>
                            <a
                                href="/shows/popular"
                                class="block px-5 py-3 text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            >
                                {m.nav_popular()}
                            </a>
                            <a
                                href="/simulcast"
                                class="block px-5 py-3 text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            >
                                {m.nav_simulcast()}
                            </a>
                            <a
                                href="/release-calendar"
                                class="block px-5 py-3 text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            >
                                {m.nav_release_calendar()}
                            </a>
                        </nav>

                        <details class="group bg-header-hover">
                            <summary
                                class="flex min-h-12 w-full cursor-pointer list-none items-center justify-between px-5 text-left text-base text-muted transition-colors hover:bg-panel-hover focus:bg-panel-hover focus:text-foreground focus:outline-none [&::-webkit-details-marker]:hidden"
                            >
                                <span>Categories</span>
                                <svg
                                    class="header-svg-icon size-6 fill-current transition-transform group-open:rotate-180"
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    data-t="dropdown-svg"
                                    aria-hidden="true"
                                    role="img"
                                >
                                    <path d="M7 10h10l-5 5z"></path>
                                </svg>
                            </summary>
                            <nav
                                id="mobile-navigation-categories"
                                class="bg-panel-strong px-3 py-2"
                                aria-label="Categories"
                            >
                                {#each data.genres as genre}
                                    <a
                                        href={`/category/${genre.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}
                                        class="block px-5 py-2.5 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    >
                                        {genre}
                                    </a>
                                {/each}
                            </nav>
                        </details>

                        <Button
                            type="submit"
                            form="sign-out"
                            class="block w-full border-t border-border/60 bg-header-hover px-5 py-3 text-left text-base text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                        >
                            {m.nav_logout()}
                        </Button>
                    </div>
                {/snippet}
            </Dropdown>

            <div class="pointer-events-auto ml-auto flex h-full items-center bg-header">
                <a
                    href="/search"
                    class="grid h-14 w-12 place-items-center text-muted hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label={m.nav_search()}
                >
                    <svg
                        class="header-svg-icon size-6 fill-current"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        data-t="search-svg"
                        aria-hidden="true"
                        role="img"
                    >
                        <path
                            fill-rule="evenodd"
                            clip-rule="evenodd"
                            d="M10.5 19C12.4879 19 14.3164 18.3176 15.7641 17.1742L21.2927 22.7069L22.7074 21.2931L17.1778 15.7595C18.319 14.3126 19 12.4858 19 10.5C19 5.80558 15.1944 2 10.5 2C5.80558 2 2 5.80558 2 10.5C2 15.1944 5.80558 19 10.5 19ZM10.5 17C14.0899 17 17 14.0899 17 10.5C17 6.91015 14.0899 4 10.5 4C6.91015 4 4 6.91015 4 10.5C4 14.0899 6.91015 17 10.5 17Z"
                        ></path>
                    </svg>
                </a>
                <a
                    href="/watchlist"
                    class="grid h-14 w-12 place-items-center text-muted transition-colors hover:bg-header-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label={m.nav_watchlist()}
                >
                    <svg
                        class="header-svg-icon size-6 fill-current"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        data-t="watchlist-svg"
                        aria-hidden="true"
                        role="img"
                    >
                        <path
                            fill-rule="evenodd"
                            clip-rule="evenodd"
                            d="M19.0001 20.5858C19.0001 21.4767 17.9229 21.9229 17.293 21.2929L12.0001 16L6.7071 21.2929C6.07714 21.9229 5 21.4769 5 20.5858L5.00006 3H19.0001V20.5858ZM7.00001 18.1716L7.00006 5H17.0001V18.1716L12.0001 13.1716L7.00001 18.1716Z"
                        ></path>
                    </svg>
                </a>
                <a
                    href="/profiles/{data.profile.id}"
                    class="grid h-14 w-12 place-items-center hover:bg-header-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label={data.profile.name}
                >
                    <Avatar seed={data.profile.avatar} class="size-8" />
                </a>
            </div>
        </div>
    </nav>

    <form id="switch-profile" method="POST" action="/profiles?/select&redirect={here}" hidden></form>
    <form id="sign-out" method="POST" action="/logout" hidden></form>
</header>

<div id="main-content" class="pt-14" tabindex="-1">
    {#if navigating.to}
        <main
            class="grid min-h-[calc(100dvh-3.5rem)] place-items-center bg-canvas text-foreground"
            aria-busy="true"
            aria-live="polite"
        >
            <span class="sr-only">{m.navigation_loading()}</span>
            <Spinner size="2.25rem" />
        </main>
    {:else}
        {@render children()}
    {/if}
</div>
