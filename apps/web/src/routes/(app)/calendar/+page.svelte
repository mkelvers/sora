<script lang="ts" module>
	const shown = $state({
		weeks: 0,
	});
</script>

<script lang="ts">
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import Sheet from "$lib/components/ui/Sheet.svelte";
	import { mascots } from "$lib/mascots";
	import { audioLabel, cn, tmdbImage, tmdbSrcset } from "$lib/utils";
	import { Tabs } from "melt/builders";
	import {
		CaretDownIcon,
		CaretLeftIcon,
		CaretRightIcon,
		ClockIcon,
		InfoIcon,
	} from "phosphor-svelte";

	import type { PageProps } from "./$types";
	import { getCalendar } from "./calendar.remote";

	let { data }: PageProps = $props();

	const calendar = $derived(
		await getCalendar({
			timeZone: data.timeZone,
			weeks: shown.weeks,
		}),
	);

	const noon = (date: string) => new Date(`${date}T12:00:00Z`);

	const weekday = new Intl.DateTimeFormat("en", {
		weekday: "short",
		timeZone: "UTC",
	});
	const longDay = new Intl.DateTimeFormat("en", {
		weekday: "long",
		month: "long",
		day: "numeric",
		timeZone: "UTC",
	});
	const dayOfMonth = new Intl.DateTimeFormat("en", {
		day: "numeric",
		timeZone: "UTC",
	});
	const range = new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
	const clock = $derived(
		new Intl.DateTimeFormat("en", {
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
			timeZone: data.timeZone,
		}),
	);

	const week = $derived(
		range.formatRange(
			noon(calendar.days[0].date),
			noon(calendar.days[calendar.days.length - 1].date),
		),
	);

	const emptyWeek = $derived(calendar.days.every((day) => !day.episodes.length));

	const emptyCopy = (date: string) => {
		if (emptyWeek && calendar.ahead) {
			return {
				title: "The schedule for this week isn't out yet.",
				hint: "Check back closer to the week.",
			};
		}

		if (emptyWeek) {
			return {
				title: "There's no schedule for this week.",
				hint: "Try another week.",
			};
		}

		return {
			title: `Nothing airs on ${longDay.format(noon(date)).split(",")[0]}.`,
			hint: "Pick another day to see what's coming out.",
		};
	};

	let selected = $derived(calendar.days.find((day) => day.today)?.date ?? calendar.days[0].date);

	let daysOpen = $state(false);

	const current = $derived(calendar.days.find((day) => day.date === selected) ?? calendar.days[0]);

	const dayLabel = (day: (typeof calendar.days)[number]) =>
		day.today ? "Today" : weekday.format(noon(day.date));

	const tabs = new Tabs<string>({
		value: () => selected,
		onValueChange: (next) => (selected = next),
	});

	const slotsOf = (day: (typeof calendar.days)[number]) => {
		const slots = new Map<string, typeof day.episodes>();
		for (const episode of day.episodes) {
			slots.set(episode.airing_at, [...(slots.get(episode.airing_at) ?? []), episode]);
		}
		return [...slots].map(([at, episodes]) => {
			const titles = new Map<string, typeof episodes>();
			for (const episode of episodes) {
				titles.set(episode.series.id, [...(titles.get(episode.series.id) ?? []), episode]);
			}
			return {
				at,
				aired: Date.parse(at) <= calendar.now,
				releases: [...titles].flatMap(([seriesId, versions]) => {
					const rows: {
						types: ("sub" | "dub")[];
						count: number;
						numbers: string;
					}[] = [];
					for (const airType of ["sub", "dub"] as const) {
						const numbered = versions
							.filter((version) => version.air_type === airType)
							.toSorted((left, right) => left.episode - right.episode);
						const runs: {
							first: number;
							last: number;
						}[] = [];
						for (const version of numbered) {
							const run = runs.at(-1);
							if (run?.last === version.episode - 1) {
								run.last = version.episode;
							} else {
								runs.push({
									first: version.episode,
									last: version.episode,
								});
							}
						}
						if (!runs.length) {
							continue;
						}

						const numbers = runs
							.map((run) => (run.first === run.last ? run.first : `${run.first}–${run.last}`))
							.join(", ");
						const same = rows.find((row) => row.numbers === numbers);
						if (same) {
							same.types.push(airType);
						} else {
							rows.push({
								types: [airType],
								count: numbered.length,
								numbers,
							});
						}
					}

					return rows.map((row) => ({
						key: `${seriesId}:${row.types.join()}`,
						series: versions[0].series,
						episodes: `${row.count === 1 ? "Episode" : "Episodes"} ${row.numbers}`,
						language: audioLabel(row.types),
					}));
				}),
			};
		});
	};
</script>

<svelte:head>
	<title>Release Calendar · Sora</title>
</svelte:head>

<div
	class="min-h-dvh overflow-x-clip bg-canvas px-5 py-10 text-foreground sm:px-10 sm:py-12 lg:px-16 lg:py-16"
>
	<section class="mx-auto w-full max-w-7xl" aria-labelledby="calendar-title">
		<div class="mb-6 flex items-center justify-between gap-2 sm:mb-8 sm:gap-4">
			<div class="flex flex-col items-start">
				<h1 id="calendar-title" class="text-xl font-bold sm:text-2xl">Release Calendar</h1>
				<p class="mt-1 text-sm text-muted tabular-nums">{week}</p>
			</div>

			<nav class="flex items-center gap-1" aria-label="Weeks">
				{#if shown.weeks !== 0}
					<Button onclick={() => (shown.weeks = 0)} variant="ghost" class="max-sm:hidden">
						This week
					</Button>
				{/if}
				<Button
					onclick={() => (shown.weeks -= 1)}
					variant="icon"
					class="size-11 sm:size-9"
					aria-label="Previous week"
				>
					<CaretLeftIcon size="1.25rem" weight="bold" />
				</Button>
				<Button
					onclick={() => (shown.weeks += 1)}
					variant="icon"
					class="size-11 sm:size-9"
					aria-label="Next week"
				>
					<CaretRightIcon size="1.25rem" weight="bold" />
				</Button>
			</nav>
		</div>

		<div class="mb-2 flex items-center justify-between gap-2 sm:hidden">
			<Button
				variant="ghost"
				class="min-h-11 gap-2 px-0 tracking-normal hover:bg-transparent hover:text-muted"
				aria-label="Choose day, {longDay.format(noon(current.date))} selected"
				aria-haspopup="dialog"
				aria-controls="day-list"
				onclick={() => (daysOpen = true)}
			>
				<CaretDownIcon size="0.875rem" weight="fill" />
				{dayLabel(current)} · {longDay.format(noon(current.date)).split(", ")[1]}
			</Button>
			{#if shown.weeks !== 0}
				<Button onclick={() => (shown.weeks = 0)} variant="ghost" class="px-0">This week</Button>
			{/if}
		</div>

		<div {...tabs.triggerList} aria-label="Days" class="grid grid-cols-7 max-sm:hidden">
			{#each calendar.days as day (day.date)}
				<button
					{...tabs.getTrigger(day.date)}
					type="button"
					class="-mb-px flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 border-b-2 border-transparent py-2 text-muted transition-colors outline-none hover:bg-white/4 hover:text-foreground focus-visible:bg-white/8 aria-selected:border-accent aria-selected:text-foreground"
					aria-label="{longDay.format(noon(day.date))}, {day.episodes.length} {day.episodes
						.length === 1
						? 'episode'
						: 'episodes'}"
				>
					<span
						class={cn("text-xs font-bold tracking-widest uppercase", day.today && "text-accent")}
					>
						{dayLabel(day)}
					</span>
					<span
						class={cn(
							"text-2xl font-bold tabular-nums",
							!day.episodes.length && "text-subtle",
							day.today && "text-accent",
						)}
					>
						{dayOfMonth.format(noon(day.date))}
					</span>
				</button>
			{/each}
		</div>

		{#each calendar.days as day (day.date)}
			<section
				{...tabs.getContent(day.date)}
				aria-label={longDay.format(noon(day.date))}
				class="outline-none"
			>
				{#if day.date === selected}
					{@const slots = slotsOf(day)}
					{#if slots.length}
						<ol class="flex flex-col gap-8 pt-6 pb-10 sm:gap-10 sm:pt-8">
							{#each slots as slot, index (slot.at)}
								{#if day.today && !slot.aired && (index === 0 || slots[index - 1].aired)}
									<li class="text-sm font-semibold text-accent tabular-nums sm:pl-34">
										Now · {clock.format(calendar.now)}
									</li>
								{/if}
								<li class="grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-6">
									<time
										datetime={slot.at}
										class={cn(
											"text-lg font-bold tabular-nums sm:text-2xl",
											slot.aired && day.today && "text-muted",
										)}
									>
										{clock.format(new Date(slot.at))}
									</time>

									<ul class="grid gap-x-5 gap-y-5 sm:grid-cols-2 sm:gap-y-6 lg:grid-cols-3">
										{#each slot.releases as release (release.key)}
											{@const image = release.series.backdrop_url ?? release.series.poster_url}
											<li
												class="group relative isolate flex min-w-0 flex-col focus-within:z-10 hover:z-10"
											>
												<a
													href="/series/{release.series.id}"
													class="flex min-w-0 flex-1 flex-col focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none"
												>
													<div
														class="grid grid-cols-[40%_minmax(0,1fr)] content-start gap-x-3 transition-opacity duration-150 sm:flex sm:flex-col sm:group-hover:opacity-0 sm:group-has-focus-visible:opacity-0"
													>
														<div
															class="relative row-span-3 aspect-video w-full self-start overflow-hidden bg-surface"
														>
															{#if image}
																<Image
																	src={tmdbImage(image, "w780")}
																	srcset={tmdbSrcset(image, {
																		w300: 300,
																		w780: 780,
																	})}
																	sizes="(min-width: 64rem) 22vw, (min-width: 40rem) 40vw, 40vw"
																	alt="Backdrop of {release.series.title}"
																	class="brightness-75"
																/>
															{/if}
														</div>
														<h3
															class="line-clamp-2 text-sm leading-snug font-bold sm:mt-3.5 sm:text-base"
														>
															{release.series.title}
														</h3>
														<p class="mt-1 text-xs text-muted sm:text-sm">
															{release.episodes} · {release.language}
														</p>
													</div>

													<div
														aria-hidden="true"
														class="pointer-events-none absolute -inset-2 z-10 flex flex-col bg-surface px-4 pt-6 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-has-focus-visible:opacity-100 max-sm:hidden"
													>
														<p class="line-clamp-1 text-xs font-semibold text-subtle uppercase">
															{release.series.title}
														</p>
														<p class="mt-2 text-base leading-snug font-bold text-foreground">
															{release.episodes}
														</p>
														<p class="text-sm text-muted">{release.language}</p>
														<p class="mt-1 flex items-center gap-1.5 text-sm text-muted">
															<ClockIcon size="1rem" />
															{longDay.format(noon(day.date)).split(",")[0]} · {clock.format(
																new Date(slot.at),
															)}
														</p>
														{#if release.series.overview}
															<p class="mt-2 line-clamp-4 text-sm leading-snug text-foreground">
																{release.series.overview}
															</p>
														{/if}
														<span
															class="mt-auto flex h-10 shrink-0 items-center gap-2 text-sm font-bold text-accent uppercase"
														>
															<InfoIcon size="1.25rem" weight="bold" />
															View series
														</span>
													</div>
												</a>
											</li>
										{/each}
									</ul>
								</li>
							{/each}
						</ol>
					{:else}
						<div class="pt-8">
							<EmptyState mascot={mascots.emptyCalendar} {...emptyCopy(day.date)} />
						</div>
					{/if}
				{/if}
			</section>
		{/each}
	</section>
</div>

<Sheet bind:open={daysOpen} id="day-list" title="Day List">
	{#each calendar.days as day (day.date)}
		<Button
			variant="item"
			class="justify-between aria-[current=true]:font-normal aria-[current=true]:text-foreground"
			aria-current={day.date === selected ? "true" : undefined}
			onclick={() => {
				daysOpen = false;
				selected = day.date;
			}}
		>
			{longDay.format(noon(day.date))}
			<span class="text-subtle tabular-nums">{day.episodes.length}</span>
		</Button>
	{/each}
</Sheet>
