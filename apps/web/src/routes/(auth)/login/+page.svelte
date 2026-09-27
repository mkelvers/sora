<script lang="ts">
    import { enhance } from '$app/forms';
    import AuthInput from '../_components/AuthInput.svelte';
    import StatusBanner from '$lib/components/StatusBanner.svelte';
    import Button from '$lib/components/ui/button/Button.svelte';
    import { m } from '$lib/i18n.svelte';
    import type { PageProps } from './$types';

    let { form }: PageProps = $props();

    let email = $state(form?.email ?? '');
    let password = $state('');
    let pending = $state(false);
    let dismissed = $state(false);
</script>

<svelte:head>
    <title>Sora — {m.nav_login()}</title>
    <meta name="description" content={m.auth_login_description()} />
    <meta name="robots" content="noindex" />
</svelte:head>

<StatusBanner message={dismissed ? '' : (form?.message ?? '')} tone="error" ondismiss={() => (dismissed = true)} />

<form
    class="w-full max-w-104"
    method="POST"
    aria-busy={pending}
    use:enhance={() => {
        pending = true;
        dismissed = false;
        return async ({ update }) => {
            await update({ reset: false });
            password = '';
            pending = false;
        };
    }}
>
    <h1 class="text-center text-3xl font-normal">{m.auth_login_title()}</h1>

    <div class="mt-16 space-y-6">
        <AuthInput
            name="email"
            label={m.auth_email()}
            type="email"
            autocomplete="email"
            autocapitalize="none"
            spellcheck={false}
            constraints={{
                required: true,
            }}
            bind:value={email}
        />
        <AuthInput
            name="password"
            label={m.auth_password()}
            type="password"
            autocomplete="current-password"
            constraints={{
                required: true,
            }}
            bind:value={password}
        />
    </div>

    <Button
        class="mt-10 min-h-11 w-full px-4 text-xs font-bold uppercase active:scale-[0.97]"
        type="submit"
        disabled={pending}
    >
        {pending ? m.auth_logging_in() : m.auth_login()}
    </Button>
</form>
