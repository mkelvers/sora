<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/state';
    import { CheckIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from 'phosphor-svelte';
    import StatusBanner from '$lib/components/StatusBanner.svelte';
    import Avatar from '$lib/components/ui/Avatar.svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import type { PageProps } from './$types';

    let { data, form }: PageProps = $props();

    let deleting = $state<string | null>(null);

    const managing = $derived(page.url.searchParams.has('manage'));
    const switchMode = $derived.by(() => {
        const params = new URLSearchParams(page.url.search);
        if (managing) {
            params.delete('manage');
        } else {
            params.set('manage', '1');
        }
        return params.size > 0 ? `/profiles?${params}` : '/profiles';
    });
</script>

<svelte:head>
    <title>Sora — {managing ? 'Manage profiles' : "Who's watching?"}</title>
</svelte:head>

<StatusBanner message={form?.message ?? ''} tone="error" />

<div class="flex w-full max-w-5xl flex-col items-center gap-12">
    <h1 class="text-center text-3xl font-normal">{managing ? 'Manage profiles' : "Who's watching?"}</h1>

    <form
        method="POST"
        action="?/{managing ? 'delete' : 'select'}{page.url.search.replace('?', '&')}"
        use:enhance={({ submitter }) => {
            if (managing && submitter instanceof HTMLButtonElement) {
                deleting = submitter.value;
            }
            return async ({ update }) => {
                await update();
                deleting = null;
            };
        }}
    >
        <ul class="flex flex-wrap justify-center gap-x-8 gap-y-10">
            {#each data.profiles as profile (profile.id)}
                <li class="relative">
                    {#if managing}
                        <a
                            class="group flex w-32 flex-col items-center gap-3 sm:w-36"
                            href="/profiles/{profile.id}{page.url.search}"
                            aria-label="Edit {profile.name}"
                        >
                            <span class="relative grid size-32 place-items-center sm:size-36">
                                <Avatar seed={profile.avatar} class="size-full opacity-40 transition-opacity group-hover:opacity-60" />
                                <PencilSimpleIcon size="2.5rem" class="absolute text-foreground" aria-hidden="true" />
                            </span>
                            <span class="max-w-full truncate text-sm text-muted group-hover:text-foreground">{profile.name}</span>
                        </a>
                        {#if data.profiles.length > 1}
                            <Button
                                type="submit"
                                name="profile"
                                value={profile.id}
                                disabled={deleting !== null}
                                class="absolute top-2 right-2 size-9 bg-canvas/80 text-status-error hover:bg-status-error hover:text-foreground"
                                aria-label="Delete {profile.name}"
                            >
                                <TrashIcon size="1.1rem" aria-hidden="true" />
                            </Button>
                        {/if}
                    {:else}
                        <button
                            type="submit"
                            name="profile"
                            value={profile.id}
                            class="group flex w-32 cursor-pointer flex-col items-center gap-3 sm:w-36"
                        >
                            <Avatar
                                seed={profile.avatar}
                                class="size-32 outline-2 outline-offset-4 outline-transparent transition-[outline-color] group-hover:outline-foreground group-focus-visible:outline-foreground sm:size-36"
                            />
                            <span class="max-w-full truncate text-sm text-muted group-hover:text-foreground">{profile.name}</span>
                        </button>
                    {/if}
                </li>
            {/each}

            {#if !managing}
                <li>
                    <a class="group flex w-32 flex-col items-center gap-3 sm:w-36" href="/profiles/new{page.url.search}">
                        <span
                            class="grid size-32 place-items-center bg-surface text-muted transition-colors group-hover:bg-panel group-hover:text-foreground sm:size-36"
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
        <a
            class="inline-flex min-h-10 items-center gap-2 border-2 px-5 text-xs font-bold uppercase transition-colors {managing
                ? 'border-accent bg-accent text-on-accent hover:brightness-110'
                : 'border-border-strong text-muted hover:border-foreground hover:text-foreground'}"
            href={switchMode}
        >
            {#if managing}
                <CheckIcon size="1rem" weight="bold" aria-hidden="true" />
                Done
            {:else}
                <PencilSimpleIcon size="1rem" weight="bold" aria-hidden="true" />
                Manage profiles
            {/if}
        </a>

        <form method="POST" action="/logout">
            <Button type="submit" class="min-h-10 px-5 text-xs font-bold text-muted uppercase hover:text-foreground">
                Sign out
            </Button>
        </form>
    </div>
</div>
