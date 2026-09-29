<script lang="ts">
	import { page } from "$app/state";
	import { cn } from "$lib/utils";
	import { BellSimpleIcon } from "phosphor-svelte";

	import { getUnreadNotifications } from "../home.remote";

	let {
		class: className,
	}: {
		class: string;
	} = $props();

	const unreadQuery = getUnreadNotifications();
	const unread = $derived(unreadQuery.current ?? 0);

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

<a
	href="/notifications"
	class={cn(
		className,
		"relative",
		page.url.pathname === "/notifications" && "bg-header-hover text-foreground",
		unread > 0 &&
			"after:absolute after:top-3.5 after:right-3 after:size-2 after:rounded-full after:bg-status-error after:ring-2 after:ring-header sm:after:right-4",
	)}
	aria-label={unread > 0 ? "Notifications, new notifications" : "Notifications"}
>
	<BellSimpleIcon size="1.5rem" />
</a>
