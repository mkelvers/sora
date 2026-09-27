<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/state';
    import { ShuffleIcon } from 'phosphor-svelte';
    import StatusBanner from '$lib/components/StatusBanner.svelte';
    import Avatar from '$lib/components/ui/Avatar.svelte';
    import Button from '$lib/components/ui/button/Button.svelte';
    import Input from '$lib/components/ui/input/Input.svelte';
    import type { PageProps } from './$types';

    let { data, form }: PageProps = $props();

    let avatar = $derived(data.profile.avatar);
    let choices = $derived(data.choices);
    let pending = $state(false);

    const shown = $derived([...new Set([data.profile.avatar, ...choices])]);
</script>

<svelte:head>
    <title>Sora — Edit profile</title>
</svelte:head>

<StatusBanner message={form?.message ?? ''} tone="error" />

<form
    class="w-full max-w-xl"
    method="POST"
    use:enhance={() => {
        pending = true;
        return async ({ update }) => {
            await update({ reset: false });
            pending = false;
        };
    }}
>
    <h1 class="text-3xl font-normal">Edit profile</h1>

    <div class="mt-10 grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-6">
        <Avatar seed={avatar} class="size-24" />
        <div>
            <label class="block text-sm text-muted" for="name">Name</label>
            <Input
                id="name"
                name="name"
                class="mt-2 h-11 rounded-none"
                value={form?.name ?? data.profile.name}
                maxlength={40}
                autocomplete="off"
                required
            />
        </div>
    </div>

    <fieldset class="mt-10">
        <div class="flex items-center justify-between">
            <legend class="text-sm text-muted">Avatar</legend>
            <Button
                variant="ghost"
                class="min-h-9 px-3 text-xs font-bold text-muted uppercase hover:text-foreground"
                onclick={() =>
                    (choices = choices.map((seed) => (seed === avatar ? seed : crypto.randomUUID().slice(0, 8))))}
            >
                <ShuffleIcon size="1rem" aria-hidden="true" />
                More avatars
            </Button>
        </div>

        <div class="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6">
            {#each shown as seed (seed)}
                <label
                    class="cursor-pointer outline-2 outline-offset-2 outline-transparent transition-[outline-color] has-checked:outline-accent hover:outline-border-strong"
                >
                    <input class="sr-only" type="radio" name="avatar" value={seed} bind:group={avatar} />
                    <Avatar {seed} class="w-full" />
                </label>
            {/each}
        </div>
    </fieldset>

    <div class="mt-10 flex gap-3">
        <Button
            type="submit"
            class="min-h-11 flex-1 bg-accent px-4 text-xs font-bold text-on-accent uppercase hover:brightness-110"
            disabled={pending}
        >
            {pending ? 'Saving…' : 'Save'}
        </Button>
        <a
            class="inline-flex min-h-11 flex-1 items-center justify-center border-2 border-border-strong px-4 text-xs font-bold text-muted uppercase hover:border-foreground hover:text-foreground"
            href="/profiles{page.url.search}"
        >
            Cancel
        </a>
    </div>
</form>
