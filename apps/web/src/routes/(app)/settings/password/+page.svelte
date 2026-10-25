<script lang="ts">
	import { enhance } from "$app/forms";
	import StatusBanner from "$lib/components/status-banner.svelte";
	import Button from "$lib/components/ui/button.svelte";
	import Field from "$lib/components/ui/field.svelte";

	import type { PageProps } from "./$types";

	let { form }: PageProps = $props();

	const fields = [
		{
			autocomplete: "current-password",
			label: "Current password",
			name: "currentPassword",
		},
		{
			autocomplete: "new-password",
			label: "New password",
			name: "newPassword",
		},
		{
			autocomplete: "new-password",
			label: "Confirm new password",
			name: "confirmPassword",
		},
	] as const;

	const values = $state({
		confirmPassword: "",
		currentPassword: "",
		newPassword: "",
	});
	let pending = $state(false);
	let dismissed = $state(false);

	const message = $derived(!dismissed && form?.saved ? "Password changed." : "");
</script>

<svelte:head>
	<title>Password - Settings - Sora</title>
</svelte:head>

<StatusBanner {message} ondismiss={() => (dismissed = true)} />

<section class="bg-raised px-5 py-12 sm:py-16" aria-labelledby="change-password">
	<div class="mx-auto max-w-sm">
		<h2 id="change-password" class="text-center text-2xl font-bold">Change Password</h2>
		<p class="mt-3 text-center text-sm text-muted">
			Changing your password signs you out of your other devices.
		</p>

		<form
			class="mt-10"
			method="POST"
			novalidate
			aria-busy={pending}
			use:enhance={() => {
				pending = true;
				dismissed = false;
				return async ({ update, result }) => {
					await update({
						reset: false,
					});
					if (result.type === "success") {
						values.currentPassword = "";
						values.newPassword = "";
						values.confirmPassword = "";
					} else if (form?.errors?.currentPassword) {
						values.currentPassword = "";
					}
					pending = false;
				};
			}}
		>
			<div class="space-y-8">
				{#each fields as field (field.name)}
					<Field
						name={field.name}
						label={field.label}
						type="password"
						autocomplete={field.autocomplete}
						required
						class="[&_input]:h-10 [&_input]:border-0 [&_input]:border-b [&_input]:border-border [&_input]:pl-0 [&_input]:text-base [&_input]:font-medium [&_input:not([aria-invalid])]:hover:border-border [&_input:not([aria-invalid])]:focus-visible:border-border [&_label]:text-xs [&_label]:text-subtle"
						error={form?.errors?.[field.name]}
						bind:value={values[field.name]}
					/>
				{/each}
			</div>

			<Button type="submit" variant="primary" class="mt-10 w-full" loading={pending}>
				Change Password
			</Button>
		</form>
	</div>
</section>
