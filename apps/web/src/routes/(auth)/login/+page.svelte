<script lang="ts">
	import { enhance } from "$app/forms";
	import logo from "$lib/assets/logo.png";
	import StatusBanner from "$lib/components/StatusBanner.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import { untrack } from "svelte";

	import AuthInput from "../_components/AuthInput.svelte";
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
	<meta name="robots" content="noindex" />
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
		<img src={logo} alt="Sora logo" class="size-16" />
		<h1 id="sign-in" class="mt-6 text-3xl font-bold sm:text-4xl">Welcome back</h1>
		<p class="mt-3 text-muted">Sign in to pick up where you left off.</p>
	</header>

	<div class="mt-12 space-y-6">
		<AuthInput
			name="email"
			label="E-mail"
			type="email"
			autocomplete="email"
			autocapitalize="none"
			spellcheck={false}
			constraints={{
				required: true,
			}}
			error={form?.errors?.email}
			bind:value={email}
		/>
		<AuthInput
			name="password"
			label="Password"
			type="password"
			autocomplete="current-password"
			constraints={{
				required: true,
			}}
			error={form?.errors?.password}
			bind:value={password}
		/>
	</div>

	<Button variant="primary" class="mt-10 w-full" type="submit" loading={pending}>Sign in</Button>
</form>
