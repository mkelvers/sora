import { attempt } from "@sora/shared";

/** Browsers, most specific first: Edge, Opera and Chrome on iOS all say Chrome or Safari too. */
const browsers: readonly (readonly [RegExp, string])[] = [
	[/\bEdg(?:e|A|iOS)?\//u, "Edge"],
	[/\bOPR\/|\bOpera\b/u, "Opera"],
	[/\bFirefox\/|\bFxiOS\//u, "Firefox"],
	[/\bCriOS\/|\bChrome\//u, "Chrome"],
	[/\bVersion\/[\d.]+.*Safari\//u, "Safari"],
];

/** Systems, most specific first: an iPad and a Chromebook both look like another system too. */
const systems: readonly (readonly [RegExp, string])[] = [
	[/\b(?:Smart-?TV|SMART-TV|Tizen|Web0S|WebOS|AppleTV|Android TV|BRAVIA)\b/u, "TV"],
	[/\biPad\b/u, "iPad"],
	[/\biPhone\b|\biPod\b/u, "iPhone"],
	[/\bAndroid\b/u, "Android"],
	[/\bCrOS\b/u, "ChromeOS"],
	[/\bWindows\b/u, "Windows"],
	[/\bMac OS X\b|\bMacintosh\b/u, "macOS"],
	[/\bLinux\b/u, "Linux"],
];

/**
 * A device as people name it, such as `Safari on iPad`, from the
 * `User-Agent` a session was signed in with. A browser or a system alone is
 * named alone; one that says neither, such as a server's HTTP client, is an
 * `Unknown device`.
 */
export const describeDevice = (userAgent: string | null): string => {
	const text = userAgent === null ? "" : userAgent;
	const browser = browsers.find(([pattern]) => pattern.test(text))?.[1];
	const system = systems.find(([pattern]) => pattern.test(text))?.[1];
	if (browser && system) {
		return `${browser} on ${system}`;
	}

	return browser ?? system ?? "Unknown device";
};

/** Where each browser writes its version, as a major version. */
const browserVersions: Readonly<Record<string, RegExp>> = {
	Chrome: /\b(?:CriOS|Chrome)\/(?<version>\d+)/u,
	Edge: /\bEdg(?:e|A|iOS)?\/(?<version>\d+)/u,
	Firefox: /\b(?:Firefox|FxiOS)\/(?<version>\d+)/u,
	Opera: /\bOPR\/(?<version>\d+)/u,
	Safari: /\bVersion\/(?<version>\d+(?:\.\d+)?)/u,
};

/** Systems whose `User-Agent` tells the real version. macOS and Windows freeze theirs, so they are left out. */
const systemVersions: Readonly<Record<string, RegExp>> = {
	Android: /\bAndroid (?<version>\d+(?:\.\d+)?)/u,
	iPad: /\bCPU OS (?<version>\d+(?:_\d+)?)/u,
	iPhone: /\bCPU iPhone OS (?<version>\d+(?:_\d+)?)/u,
};

/** The browser and system a `User-Agent` names, each with a version when it can be trusted. */
export const deviceDetails = (userAgent: string | null) => {
	const text = userAgent === null ? "" : userAgent;
	const browser = browsers.find(([pattern]) => pattern.test(text))?.[1] ?? null;
	const system = systems.find(([pattern]) => pattern.test(text))?.[1] ?? null;
	const browserVersion = browser
		? browserVersions[browser]?.exec(text)?.groups?.version
		: undefined;
	const systemVersion = system ? systemVersions[system]?.exec(text)?.groups?.version : undefined;

	return {
		browser,
		browser_version: browserVersion ?? null,
		system: system === "TV" ? null : system,
		system_version: systemVersion?.replace("_", ".") ?? null,
	};
};

/**
 * An address as people write it: an IPv6 address shortened, as Better Auth
 * stores it written out in full. `null` for one that says nothing about
 * where a sign-in came from, such as the unspecified address `::` or
 * `unknown`.
 */
export const presentAddress = (address: string | null): string | null => {
	if (address === null || address === "" || address === "unknown") {
		return null;
	}
	if (!address.includes(":")) {
		return address;
	}

	const { data: url } = attempt(() => new URL(`http://[${address}]`), TypeError);
	const written = url?.hostname.slice(1, -1) ?? address;
	return written === "::" ? null : written;
};

export type DeviceKind = "computer" | "phone" | "tablet" | "tv" | "unknown";

/**
 * What sort of device a `User-Agent` is from, for the icon beside it. An
 * Android that does not say `Mobile` is a tablet.
 */
export const deviceKind = (userAgent: string | null): DeviceKind => {
	const text = userAgent === null ? "" : userAgent;
	const system = systems.find(([pattern]) => pattern.test(text))?.[1];
	if (system === "TV") {
		return "tv";
	}
	if (system === "iPad") {
		return "tablet";
	}
	if (system === "iPhone") {
		return "phone";
	}
	if (system === "Android") {
		return /\bMobile\b/u.test(text) ? "phone" : "tablet";
	}

	return system ? "computer" : "unknown";
};
