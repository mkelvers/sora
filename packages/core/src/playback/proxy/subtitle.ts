import { shiftTime, type TimelineShift } from "../streams/align";

const timing = /^(\S+)\s+-->\s+(\S+)(.*)$/m;

/**
 * Moves every cue of a WebVTT file onto another encode's timeline, such as a
 * sub's subtitles onto its dub. A cue keeps its length and moves by the
 * shift at its start; one that would start before the video is dropped.
 */
export function retimeWebVtt(content: string, shifts: TimelineShift[]) {
  return content
    .split(/\r?\n\r?\n/)
    .flatMap((block) => {
      const match = timing.exec(block);
      const start = match && parseTimestamp(match[1]!);
      const end = match && parseTimestamp(match[2]!);
      if (!match || start === null || end === null) {
        return [block];
      }

      const moved = shiftTime(shifts, start);
      if (moved < 0) {
        return [];
      }

      return [block.replace(timing, `${formatTimestamp(moved)} --> ${formatTimestamp(end + moved - start)}${match[3]}`)];
    })
    .join("\n\n");
}

/** Seconds in a WebVTT timestamp, `hh:mm:ss.ttt` or `mm:ss.ttt`. */
function parseTimestamp(value: string) {
  const parts = /^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/.exec(value);
  if (!parts) {
    return null;
  }

  const [, hours = "0", minutes, seconds, milliseconds] = parts;
  return Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds) + Number(milliseconds) / 1_000;
}

function formatTimestamp(seconds: number) {
  const milliseconds = Math.round(seconds * 1_000);
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  return `${pad(Math.floor(milliseconds / 3_600_000))}:${pad(Math.floor(milliseconds / 60_000) % 60)}:${pad(Math.floor(milliseconds / 1_000) % 60)}.${pad(milliseconds % 1_000, 3)}`;
}
