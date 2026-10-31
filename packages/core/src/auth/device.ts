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
