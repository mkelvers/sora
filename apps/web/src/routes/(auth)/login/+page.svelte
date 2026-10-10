<script lang="ts">
	import { enhance } from "$app/forms";
	import logo from "$lib/assets/logo.png";
	import tmdbLogo from "$lib/assets/tmdb.svg";
	import StatusBanner from "$lib/components/StatusBanner.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Field from "$lib/components/ui/Field.svelte";
	import { untrack } from "svelte";

	import type { PageProps } from "./$types";

	let { form }: PageProps = $props();

	let email = $state(untrack(() => form?.email ?? ""));
	let password = $state("");
	let pending = $state(false);
	let dismissed = $state(false);
</script>

<svelte:head>
	<title>Sign in · Sora</title>
	<meta name="description" content="Sign in to Sora" />
</svelte:head>

<StatusBanner
	message={dismissed ? "" : (form?.message ?? "")}
	tone="error"
	ondismiss={() => (dismissed = true)}
/>

<form
	class="w-full max-w-md"
	aria-labelledby="sign-in"
	method="POST"
	novalidate
	aria-busy={pending}
	use:enhance={() => {
		pending = true;
		dismissed = false;
		return async ({ update }) => {
			await update({
				reset: false,
			});
			password = "";
			pending = false;
		};
	}}
>
	<header class="flex flex-col items-center text-center">
		<img src={logo} alt="Sora logo" width="160" height="160" class="size-16" />
		<h1 id="sign-in" class="mt-6 text-3xl font-bold">Welcome back</h1>
		<p class="mt-4 text-sm text-muted">Sign in to pick up where you left off.</p>
	</header>

	<div class="mt-12 space-y-6">
		<Field
			name="email"
			label="E-mail"
			type="email"
			autocomplete="email"
			autocapitalize="none"
			spellcheck={false}
			required
			error={form?.errors?.email}
			bind:value={email}
		/>
		<Field
			name="password"
			label="Password"
			type="password"
			autocomplete="current-password"
			required
			error={form?.errors?.password}
			bind:value={password}
		/>
	</div>

	<Button variant="primary" class="mt-10 w-full" type="submit" loading={pending}>Sign in</Button>

	<p class="mt-16 flex flex-col items-center gap-3 text-center text-xs text-muted">
		<img
			src={tmdbLogo}
			alt="The Movie Database (TMDB) logo"
			width="273"
			height="36"
			class="h-3 w-auto"
		/>
		This product uses the TMDB API but is not endorsed or certified by TMDB.
	</p>
</form>
