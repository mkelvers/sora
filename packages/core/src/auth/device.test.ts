import { describe, expect, test } from "bun:test";

import { describeDevice, deviceKind, presentAddress } from "./device";

describe("describeDevice", () => {
	test("names the browser and the system", () => {
		expect(
			describeDevice(
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
			),
		).toBe("Safari on macOS");
		expect(
			describeDevice(
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
			),
		).toBe("Edge on Windows");
		expect(
			describeDevice(
				"Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
			),
		).toBe("Safari on iPad");
		expect(
			describeDevice(
				"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1",
			),
		).toBe("Chrome on iPhone");
		expect(
			describeDevice("Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0"),
		).toBe("Firefox on Linux");
	});

	test("names a TV by its system", () => {
		expect(describeDevice("Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36")).toBe(
			"TV",
		);
	});

	test("does not know a server's HTTP client", () => {
		expect(describeDevice("Bun/1.4.4")).toBe("Unknown device");
		expect(describeDevice(null)).toBe("Unknown device");
	});
});

describe("presentAddress", () => {
	test("shortens an IPv6 address written out in full", () => {
		expect(presentAddress("2a01:04f8:0010:0000:0000:0000:0000:0002")).toBe("2a01:4f8:10::2");
	});

	test("keeps an IPv4 address", () => {
		expect(presentAddress("203.0.113.7")).toBe("203.0.113.7");
	});

	test("says nothing for an address that tells nothing", () => {
		expect(presentAddress("0000:0000:0000:0000:0000:0000:0000:0000")).toBeNull();
		expect(presentAddress("unknown")).toBeNull();
		expect(presentAddress(null)).toBeNull();
	});
});

describe("deviceKind", () => {
	test("tells a phone, a tablet, a computer and a TV apart", () => {
		expect(deviceKind("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1")).toBe(
			"phone",
		);
		expect(deviceKind("Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) Safari/604.1")).toBe("tablet");
		expect(deviceKind("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36")).toBe(
			"phone",
		);
		expect(deviceKind("Mozilla/5.0 (Linux; Android 14; SM-X900) Safari/537.36")).toBe("tablet");
		expect(
			deviceKind("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.4 Safari/605.1"),
		).toBe("computer");
		expect(deviceKind("Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0)")).toBe("tv");
	});

	test("does not know what a server's HTTP client is", () => {
		expect(deviceKind("Bun/1.4.4")).toBe("unknown");
		expect(deviceKind(null)).toBe("unknown");
	});
});
