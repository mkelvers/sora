#!/usr/bin/env bash
#
# Installs, updates, backs up, and removes Sora with Docker Compose.
#
#   curl -fsSL https://github.com/mkelvers/sora/releases/latest/download/install.sh | bash
#
# Later, from the install folder:
#
#   ~/sora/sora.sh update | backup | uninstall
#
# Commands:
#   install    (default) Install Sora, or bring an existing install up to date
#   update     Back up the database, then move to the newest release
#   backup     Write a database dump to <dir>/backups
#   uninstall  Stop Sora; optionally delete its data
#
# Options:
#   --dir PATH          Install folder (default: ~/sora, or this script's folder)
#   --version vX.Y.Z    Install this release instead of the newest
#   --yes               Never ask; take every answer from the variables below
#   --dry-run           Print what would change without changing anything
#   --help              Show this help
#
# Every question has a variable that answers it ahead of time:
#   SORA_TMDB_TOKEN           TMDB "API Read Access Token"
#   SORA_ANIME_SCHEDULE_KEY   AnimeSchedule API application token
#   SORA_ACCESS               local (this computer), lan (home network), or domain
#   SORA_DOMAIN               Domain name for SORA_ACCESS=domain
#   SORA_PORT                 Port for local and lan (default 8080)
#   SORA_USERNAME             First account's username
#   SORA_PASSWORD             First account's password
#   SORA_DUB_TIMING           yes to time dub subtitles to speech (~1.5 GB more), default no
#   SORA_CONFIRM_REMOVE       The install folder's name, to let uninstall delete all data
#   SORA_DIR                  Same as --dir
#
# The script logs everything to <dir>/logs. It never prints secrets or keys,
# and never overwrites a secret it generated before.

set -Eeuo pipefail

readonly releases_url_default="https://github.com/mkelvers/sora/releases"
readonly docker_install_commit="8ad27bd3ac871feabe62f1d926c4067800c1732f"
readonly docker_install_sha256="77f623a9f23857ebc45a50e37696fc406e3a60bda4ef17399444f792ecf8895d"
readonly docker_install_version="29.5"
readonly minimum_docker="24.0.0"
readonly minimum_compose="2.24.0"
readonly minimum_disk_kb=$((10 * 1024 * 1024))
readonly minimum_memory_bytes=$((1536 * 1024 * 1024))
readonly username_pattern='^[a-zA-Z0-9_.]{3,30}$'
readonly token_pattern='^[A-Za-z0-9._~+/=-]+$'
readonly domain_pattern='^([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$'
readonly tag_pattern='^v[0-9]+\.[0-9]+\.[0-9]+$'

command_name="install"
dir=""
requested_version=""
assume_yes=0
dry_run=0
log_file=""
tmp_dir=""
spinner_pid=""
use_color=0
is_tty_out=0
can_prompt=0
docker_cmd=(docker)
compose_cmd=()
os_name=""
arch=""
is_wsl=0

# Values read from and written to <dir>/.env.
env_keys=()

usage() {
	sed -n '2,/^$/p' "${BASH_SOURCE[0]}" 2>/dev/null | sed 's/^# \{0,1\}//' || printf 'Usage: install.sh [install|update|backup|uninstall] [--dir PATH] [--version vX.Y.Z] [--yes] [--dry-run]\n'
}

# ---------------------------------------------------------------------------
# Output

setup_terminal() {
	exec 3>&1
	if [[ -t 1 ]]; then
		is_tty_out=1
	fi
	if [[ $is_tty_out == 1 && -z ${NO_COLOR:-} && ${TERM:-} != "dumb" ]]; then
		use_color=1
	fi
	if [[ $assume_yes == 0 ]] && { : </dev/tty; } 2>/dev/null; then
		can_prompt=1
	fi
}

paint() {
	if [[ $use_color == 1 ]]; then
		printf '\033[%sm%s\033[0m' "$1" "$2"
	else
		printf '%s' "$2"
	fi
}

# Prints to the terminal and the log.
say() {
	printf '%s\n' "$*" >&3
	printf '%s\n' "$*"
}

ok() {
	printf '%s %s\n' "$(paint 32 "✓")" "$*" >&3
	printf 'OK: %s\n' "$*"
}

warn() {
	printf '%s %s\n' "$(paint 33 "!")" "$*" >&3
	printf 'WARNING: %s\n' "$*"
}

die() {
	spinner_stop
	printf '%s %s\n' "$(paint 31 "✗")" "$*" >&3
	printf 'ERROR: %s\n' "$*"
	if [[ -n $log_file ]]; then
		printf '  Log: %s\n' "$log_file" >&3
	fi
	exit 1
}

spinner_start() {
	if [[ $is_tty_out == 0 ]]; then
		printf '  … %s\n' "$1" >&3
		printf '... %s\n' "$1"
		return
	fi
	printf '... %s\n' "$1"
	(
		trap - ERR
		frames=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
		index=0
		while :; do
			printf '\r%s %s' "$(paint 36 "${frames[index]}")" "$1" >&3
			index=$(((index + 1) % ${#frames[@]}))
			sleep 0.1
		done
	) &
	spinner_pid=$!
}

spinner_stop() {
	if [[ -n $spinner_pid ]]; then
		kill "$spinner_pid" 2>/dev/null || :
		wait "$spinner_pid" 2>/dev/null || :
		spinner_pid=""
		printf '\r\033[K' >&3
	fi
}

# Writes everything after this point to the log; the terminal stays on fd 3.
start_log() {
	local stamp
	stamp=$(date -u +%Y%m%dT%H%M%SZ)
	if [[ $dry_run == 1 ]] || [[ $command_name != "install" && ! -f "$dir/.env" ]]; then
		log_file=$(mktemp "${TMPDIR:-/tmp}/sora-${command_name}-XXXXXX")
	else
		mkdir -p "$dir/logs"
		log_file="$dir/logs/${command_name}-${stamp}.log"
		: >"$log_file"
	fi
	exec >>"$log_file" 2>&1
	printf 'Sora %s, %s UTC\n' "$command_name" "$stamp"
	printf '%s %s\n' "$(paint 1 "Sora")" "$(paint 2 "$command_name")" >&3
	printf '%s\n\n' "$(paint 2 "Log: $log_file")" >&3
}

# Reports the first failure, wherever it happens. Bash 3.2 runs this trap only
# inside a failing ( ) subshell, never in the script around it, while bash 5
# runs it in both; the marker file keeps it to one report.
on_error() {
	local status=$1 line=$2 command=$3
	trap - ERR
	if [[ -n $tmp_dir && -e "$tmp_dir/failed" ]]; then
		exit "$status"
	fi
	if [[ -n $tmp_dir && -d $tmp_dir ]]; then
		: >"$tmp_dir/failed"
	fi
	spinner_stop
	{
		printf '\n%s %s\n' "$(paint 31 "✗")" "Failed: $command"
		printf '  at %s line %s, exit code %s\n' "${BASH_SOURCE[1]:-install.sh}" "$line" "$status"
		if [[ -n $log_file && -f $log_file ]]; then
			printf '\n  Last lines of the log:\n'
			tail -n 20 "$log_file" | sed 's/^/    /'
			printf '\n  Full log: %s\n' "$log_file"
		fi
	} >&3
	if ((${#compose_cmd[@]} > 0)) && ! "${docker_cmd[@]}" info >/dev/null 2>&1; then
		printf '\n  Docker is not responding. Start it again, then re-run this command; it picks up\n  where it stopped.\n' >&3
	fi
	printf 'FAILED: %s (line %s, exit %s)\n' "$command" "$line" "$status"
	exit "$status"
}

on_exit() {
	spinner_stop
	if [[ -n $partial_backup && -f $partial_backup ]]; then
		rm -f "$partial_backup"
	fi
	if [[ -n $tmp_dir && -d $tmp_dir ]]; then
		rm -rf "$tmp_dir"
	fi
}

# Runs a command that changes something, or prints it under --dry-run.
run() {
	if [[ $dry_run == 1 ]]; then
		printf '  %s %s\n' "$(paint 2 "would run:")" "$(quote "$@")" >&3
		printf 'DRY RUN: %s\n' "$(quote "$@")"
		return 0
	fi
	printf '+ %s\n' "$(quote "$@")"
	"$@"
}

quote() {
	local out="" word
	for word in "$@"; do
		out+="$(printf '%q' "$word") "
	done
	printf '%s' "${out% }"
}

# ---------------------------------------------------------------------------
# Questions

# Asks a question on the terminal; the answer lands in REPLY.
ask() {
	local question=$1 default=${2:-}
	if [[ -n $default ]]; then
		question+=" $(paint 2 "[$default]")"
	fi
	printf '%s ' "$question" >&3
	IFS= read -r REPLY </dev/tty || die "Could not read an answer from the terminal."
	if [[ -z $REPLY ]]; then
		REPLY=$default
	fi
}

ask_secret() {
	printf '%s ' "$1" >&3
	IFS= read -rs REPLY </dev/tty || die "Could not read an answer from the terminal."
	printf '\n' >&3
}

ask_yes_no() {
	local question=$1 default=$2 hint="y/N"
	if [[ $default == "yes" ]]; then
		hint="Y/n"
	fi
	while :; do
		printf '%s %s ' "$question" "$(paint 2 "[$hint]")" >&3
		IFS= read -r REPLY </dev/tty || die "Could not read an answer from the terminal."
		case $(printf '%s' "${REPLY:-$default}" | tr '[:upper:]' '[:lower:]') in
		y | yes) return 0 ;;
		n | no) return 1 ;;
		esac
	done
}

missing_answer() {
	die "$2 is needed. Set $1, or run the installer in a terminal without --yes."
}

# ---------------------------------------------------------------------------
# .env

env_get() {
	local name="env_value_$1"
	printf '%s' "${!name:-}"
}

env_has() {
	local name="env_value_$1"
	[[ -n ${!name+set} ]]
}

env_set() {
	if ! env_has "$1"; then
		env_keys+=("$1")
	fi
	printf -v "env_value_$1" '%s' "$2"
}

# Splits a KEY=value line of .env into env_line_key and env_line_value.
parse_env_line() {
	[[ $1 =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || return 1
	env_line_key=${BASH_REMATCH[1]}
	env_line_value=${BASH_REMATCH[2]}
	if [[ $env_line_value =~ ^\'(.*)\'$ || $env_line_value =~ ^\"(.*)\"$ ]]; then
		env_line_value=${BASH_REMATCH[1]}
	fi
}

read_env() {
	local line
	[[ -f "$dir/.env" ]] || return 0
	while IFS= read -r line || [[ -n $line ]]; do
		if parse_env_line "$line"; then
			env_set "$env_line_key" "$env_line_value"
		fi
	done <"$dir/.env"
}

# Rewrites .env with the values set, keeping its comments, its lines whose
# value did not change, and lines it does not know; the previous file is kept
# as .env.backup-<time>. Never logs values.
write_env() {
	local target="$dir/.env" original next line written="" known
	original="$tmp_dir/env.original"
	if [[ -f $target ]]; then
		cp "$target" "$original"
	else
		env_template >"$original"
	fi
	next=$(umask 077 && mktemp "$dir/.env.next-XXXXXX")
	while IFS= read -r line || [[ -n $line ]]; do
		if parse_env_line "$line" && env_has "$env_line_key" && [[ $(env_get "$env_line_key") != "$env_line_value" ]]; then
			printf '%s=%s\n' "$env_line_key" "$(env_get "$env_line_key")"
		else
			printf '%s\n' "$line"
		fi
	done <"$original" >"$next"
	chmod 600 "$next"
	for known in ${env_keys[@]+"${env_keys[@]}"}; do
		if ! grep -q "^[[:space:]]*${known}=" "$next"; then
			written+="$known "
			printf '%s=%s\n' "$known" "$(env_get "$known")" >>"$next"
		fi
	done
	if [[ -f $target ]] && cmp -s "$target" "$next"; then
		rm -f "$next"
		return
	fi
	if [[ -f $target ]]; then
		cp -p "$target" "$target.backup-$(date -u +%Y%m%dT%H%M%SZ)"
	fi
	mv "$next" "$target"
	printf 'Wrote %s (new keys: %s)\n' "$target" "${written:-none}"
}

env_template() {
	cat <<'EOF'
# Sora's settings, read by compose.yaml in this folder. Keep this file private:
# it holds the database password and the keys that sign sessions and streams.
# After editing, apply with: docker compose up -d --wait

# Release and images. sora.sh update changes SORA_VERSION.
SORA_VERSION=
# -full adds timing dub subtitles to speech (about 1.5 GB more). Empty for the default image.
SORA_SCHEDULER_SUFFIX=

# How Sora is reached. http: SORA_BIND:SORA_PORT (127.0.0.1 = this computer, 0.0.0.0 = home network).
# https: ports 80 and 443, with a Let's Encrypt certificate for SORA_DOMAIN.
COMPOSE_PROFILES=
SORA_BIND=
SORA_PORT=
SORA_DOMAIN=

# Upstream keys. TMDB: https://www.themoviedb.org/settings/api (API Read Access Token).
# AnimeSchedule: https://animeschedule.net, Account settings, API applications.
TMDB_READ_ACCESS_TOKEN=
ANIME_SCHEDULE_API_KEY=

# Generated once by the installer; never change these on a running install.
POSTGRES_PASSWORD=
AUTH_SECRET=
STREAM_SIGNING_SECRET=
WEB_CLIENT_KEY=

# Docker Compose project name, so the containers and volumes keep their names.
COMPOSE_PROJECT_NAME=

# Optional: let people connect AniList or MyAnimeList to import their lists.
# See https://github.com/mkelvers/sora/blob/main/packages/core/.env.example
# ANILIST_CLIENT_ID=
# ANILIST_CLIENT_SECRET=
# MAL_CLIENT_ID=
# MAL_CLIENT_SECRET=
EOF
}

random_hex() {
	if command -v openssl >/dev/null 2>&1; then
		openssl rand -hex "$1"
	else
		od -An -tx1 -N"$1" /dev/urandom | tr -d ' \n'
	fi
}

random_base64() {
	if command -v openssl >/dev/null 2>&1; then
		openssl rand -base64 "$1" | tr -d '\n'
	else
		head -c "$1" /dev/urandom | base64 | tr -d '\n'
	fi
}

# Generates each secret only when .env has none, so a re-run keeps them.
ensure_secrets() {
	local created=""
	if [[ -z $(env_get POSTGRES_PASSWORD) ]]; then
		env_set POSTGRES_PASSWORD "$(random_hex 32)"
		created+="POSTGRES_PASSWORD "
	fi
	local key
	for key in AUTH_SECRET STREAM_SIGNING_SECRET WEB_CLIENT_KEY; do
		if [[ -z $(env_get "$key") ]]; then
			env_set "$key" "$(random_base64 48)"
			created+="$key "
		fi
	done
	if [[ -n $created ]]; then
		ok "Generated secrets"
		printf 'Generated %s\n' "$created"
	else
		ok "Kept existing secrets"
	fi
}

# ---------------------------------------------------------------------------
# Checks

version_at_least() {
	local have=$1 want=$2 index have_part want_part
	local IFS=.
	local -a have_parts want_parts
	read -r -a have_parts <<<"$have"
	read -r -a want_parts <<<"$want"
	for index in 0 1 2; do
		have_part=${have_parts[index]:-0}
		want_part=${want_parts[index]:-0}
		have_part=${have_part%%[!0-9]*}
		want_part=${want_part%%[!0-9]*}
		if ((10#${have_part:-0} > 10#${want_part:-0})); then
			return 0
		fi
		if ((10#${have_part:-0} < 10#${want_part:-0})); then
			return 1
		fi
	done
	return 0
}

check_platform() {
	case $(uname -s) in
	Linux)
		os_name="Linux"
		if grep -qi microsoft /proc/version 2>/dev/null; then
			if [[ $(uname -r) == *Microsoft* ]]; then
				die "This is WSL 1, which cannot run Docker. Convert the distribution with: wsl --set-version <name> 2"
			fi
			is_wsl=1
			os_name="WSL2"
		fi
		;;
	Darwin) os_name="macOS" ;;
	MINGW* | MSYS* | CYGWIN*)
		die "Git Bash, MSYS, and Cygwin are not supported. Run this in WSL2 (https://learn.microsoft.com/windows/wsl/install)."
		;;
	*) die "Unsupported system: $(uname -s). Sora installs on Linux, macOS, or WSL2." ;;
	esac
	case $(uname -m) in
	x86_64 | amd64) arch="amd64" ;;
	aarch64 | arm64) arch="arm64" ;;
	*) die "Unsupported processor: $(uname -m). Sora's images are built for amd64 and arm64." ;;
	esac
	ok "$os_name $arch"
}

install_docker() {
	if [[ $os_name == "macOS" ]]; then
		say "  Install Docker Desktop or OrbStack, start it, then run this again:"
		say "    https://docs.docker.com/desktop/setup/install/mac-install/"
		say "    https://orbstack.dev"
		die "Docker is not installed."
	fi
	if [[ $can_prompt == 1 ]]; then
		if ! ask_yes_no "Docker is not installed. Install Docker Engine $docker_install_version with Docker's script (get.docker.com)?" yes; then
			die "Docker is needed. Install it (https://docs.docker.com/engine/install/), then run this again."
		fi
	elif [[ $assume_yes == 0 ]]; then
		die "Docker is not installed. Install it (https://docs.docker.com/engine/install/), or pass --yes to let this script install it."
	fi
	local sudo=()
	if [[ $(id -u) != 0 ]]; then
		command -v sudo >/dev/null 2>&1 || die "Installing Docker needs root, and sudo is not available. Run this as root."
		sudo=(sudo)
		say "  Installing Docker needs root; sudo may ask for your password."
	fi
	local script="$tmp_dir/get-docker.sh"
	curl -fsSL --proto '=https' --tlsv1.2 -o "$script" "https://raw.githubusercontent.com/docker/docker-install/$docker_install_commit/install.sh"
	verify_sha256 "$script" "$docker_install_sha256"
	if [[ $dry_run == 1 ]]; then
		run ${sudo[@]+"${sudo[@]}"} sh "$script" --version "$docker_install_version"
		run ${sudo[@]+"${sudo[@]}"} systemctl enable --now docker
		die "Docker is not installed, so the dry run stops here."
	fi
	spinner_start "Installing Docker Engine $docker_install_version"
	run ${sudo[@]+"${sudo[@]}"} sh "$script" --version "$docker_install_version"
	if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
		run ${sudo[@]+"${sudo[@]}"} systemctl enable --now docker
	fi
	spinner_stop
	ok "Installed Docker"
}

check_docker() {
	if ! command -v docker >/dev/null 2>&1; then
		install_docker
	fi
	local probe
	if ! probe=$(docker info 2>&1); then
		printf '%s\n' "$probe"
		if [[ $probe == *"permission denied"* ]] && command -v sudo >/dev/null 2>&1; then
			if [[ $can_prompt == 0 ]] && ! sudo -n true 2>/dev/null; then
				die "Your user cannot reach the Docker daemon, and sudo needs a password. Add yourself to the docker group, or run in a terminal."
			fi
			warn "Your user cannot reach the Docker daemon; running docker with sudo. Add yourself to the docker group to avoid this."
			docker_cmd=(sudo docker)
			if ! "${docker_cmd[@]}" info >/dev/null; then
				die "Docker is not reachable even with sudo. See the log."
			fi
		elif [[ $probe == *"permission denied"* ]]; then
			die "Your user cannot reach the Docker daemon. Add it to the docker group (sudo usermod -aG docker \$USER), log in again, and run this again."
		elif [[ $os_name == "macOS" ]]; then
			die "Docker is installed but not running. Start Docker Desktop or OrbStack, then run this again."
		else
			die "Docker is installed but its daemon is not reachable. Start it (sudo systemctl start docker), then run this again."
		fi
	fi

	local server compose server_arch
	server=$("${docker_cmd[@]}" version --format '{{.Server.Version}}')
	server_arch=$("${docker_cmd[@]}" version --format '{{.Server.Arch}}')
	if ! version_at_least "$server" "$minimum_docker"; then
		die "Docker $server is too old; Sora needs $minimum_docker or newer."
	fi
	if ! compose=$("${docker_cmd[@]}" compose version --short 2>/dev/null); then
		die "Docker Compose v2 is missing. Install the compose plugin: https://docs.docker.com/compose/install/linux/"
	fi
	compose=${compose#v}
	if ! version_at_least "$compose" "$minimum_compose"; then
		die "Docker Compose $compose is too old; Sora needs $minimum_compose or newer."
	fi
	case $server_arch in
	amd64 | arm64) ;;
	*) die "Docker runs on $server_arch; Sora's images are built for amd64 and arm64." ;;
	esac
	ok "Docker $server, Compose $compose"

	local memory
	memory=$("${docker_cmd[@]}" info --format '{{.MemTotal}}')
	if [[ $memory =~ ^[0-9]+$ ]] && ((memory < minimum_memory_bytes)); then
		warn "Docker has $((memory / 1024 / 1024)) MB of memory. Sora uses up to about 1 GB of it, and services are killed when memory runs out."
	fi
	local parent=$dir available
	while [[ ! -d $parent ]]; do
		parent=$(dirname "$parent")
	done
	available=$(df -Pk "$parent" | awk 'NR == 2 { print $4 }')
	if [[ $available =~ ^[0-9]+$ ]] && ((available < minimum_disk_kb)); then
		warn "Only $((available / 1024 / 1024)) GB free at $parent; Sora wants at least 10 GB."
	fi
}

set_compose_cmd() {
	compose_cmd=("${docker_cmd[@]}" compose --project-directory "$dir" -f "$dir/compose.yaml")
}

is_port_free() {
	local port=$1
	if command -v ss >/dev/null 2>&1; then
		[[ -z $(ss -H -ltn "sport = :$port" 2>/dev/null) ]]
	elif command -v lsof >/dev/null 2>&1; then
		if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
			return 1
		fi
		return 0
	else
		return 0
	fi
}

is_running() {
	[[ -f "$dir/compose.yaml" ]] && [[ -n $("${compose_cmd[@]}" ps -q --status running "$1" 2>/dev/null) ]]
}

check_ports() {
	local ports=() port busy=""
	if [[ $(env_get COMPOSE_PROFILES) == "https" ]]; then
		is_running proxy-https && return 0
		ports=(80 443)
	else
		is_running proxy && return 0
		ports=("$(env_get SORA_PORT)")
	fi
	for port in "${ports[@]}"; do
		if ! is_port_free "$port"; then
			busy+="$port "
		fi
	done
	if [[ -n $busy ]]; then
		die "Port ${busy% } is already in use. Stop what uses it, or pick another with SORA_PORT."
	fi
	ok "Port ${ports[*]} free"
}

resolve_ips() {
	if command -v getent >/dev/null 2>&1; then
		getent ahosts "$1" 2>/dev/null | awk '{ print $1 }' | sort -u
	elif command -v dig >/dev/null 2>&1; then
		{
			dig +short A "$1"
			dig +short AAAA "$1"
		} 2>/dev/null | grep -E '^[0-9a-fA-F:.]+$' | sort -u
	elif command -v host >/dev/null 2>&1; then
		host "$1" 2>/dev/null | awk '/has (IPv6 )?address/ { print $NF }' | sort -u
	fi
}

check_domain_dns() {
	local domain=$1 resolved public
	resolved=$(resolve_ips "$domain" || :)
	if [[ -z $resolved ]]; then
		warn "$domain does not resolve yet. Point its A (or AAAA) record at this server, or the certificate cannot be issued."
		return
	fi
	public=$(
		curl -4 -fsS --max-time 5 https://api4.ipify.org 2>/dev/null || :
		printf '\n'
		curl -6 -fsS --max-time 5 https://api6.ipify.org 2>/dev/null || :
	)
	if [[ -z ${public//[[:space:]]/} ]]; then
		warn "Could not look up this server's public address to compare with $domain."
		return
	fi
	local ip
	for ip in $resolved; do
		if printf '%s\n' "$public" | grep -qxF "$ip"; then
			ok "$domain points at this server ($ip)"
			return
		fi
	done
	warn "$domain points at $(printf '%s' "$resolved" | tr '\n' ' ')but this server is $(printf '%s' "$public" | tr '\n' ' ')— the certificate cannot be issued until DNS points here."
}

# Checks an API key live. Returns 0 when accepted, 1 when rejected, 2 when the
# service could not be reached. The key goes to curl on stdin, never in argv.
check_key() {
	local url=$1 key=$2 code
	if ! code=$(printf 'header = "Authorization: Bearer %s"\n' "$key" | curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -K - "$url"); then
		return 2
	fi
	printf 'Checked %s: HTTP %s\n' "${url%%\?*}" "$code"
	case $code in
	2??) return 0 ;;
	401 | 403) return 1 ;;
	*) return 2 ;;
	esac
}

# ---------------------------------------------------------------------------
# Settings

# Takes a setting from its variable, then .env, then a question.
settle_key() {
	local env_key=$1 variable=$2 label=$3 help=$4 url=$5 value given status
	value=$(env_get "$env_key")
	given=${!variable:-}
	if [[ -n $value ]]; then
		if [[ -n $given && $given != "$value" ]]; then
			warn "$variable is ignored: .env already has $env_key. Edit $dir/.env to change it."
		fi
		ok "$label key kept from .env"
		return
	fi
	value=$given
	while :; do
		if [[ -z $value ]]; then
			[[ $can_prompt == 1 ]] || missing_answer "$variable" "The $label key"
			say ""
			say "  $help"
			ask_secret "$label key (hidden):"
			value=$REPLY
		fi
		value=$(printf '%s' "$value" | tr -d '[:space:]')
		if [[ -z $value ]]; then
			continue
		fi
		if [[ ! $value =~ $token_pattern ]]; then
			[[ $can_prompt == 1 ]] || die "$variable has characters a $label key never has."
			warn "That doesn't look like a $label key; paste it again."
			value=""
			continue
		fi
		status=0
		check_key "$url" "$value" || status=$?
		if [[ $status == 0 ]]; then
			ok "$label key works"
			break
		fi
		if [[ $status == 1 ]]; then
			[[ $can_prompt == 1 ]] || die "$label rejected the key in $variable."
			warn "$label rejected that key; paste it again."
			value=""
			continue
		fi
		if [[ $can_prompt == 1 ]]; then
			if ask_yes_no "Could not reach $label to check the key. Use it without checking?" no; then
				break
			fi
			value=""
			continue
		fi
		warn "Could not reach $label to check the key; using it unchecked."
		break
	done
	env_set "$env_key" "$value"
}

settle_access() {
	local profile access domain port
	profile=$(env_get COMPOSE_PROFILES)
	if [[ -n $profile ]]; then
		if [[ -n ${SORA_ACCESS:-} && $SORA_ACCESS != "$(access_mode)" ]]; then
			warn "SORA_ACCESS=$SORA_ACCESS is ignored: .env already sets $(access_mode). Edit $dir/.env to change it."
		fi
		ok "Access kept from .env ($(access_label))"
		return
	fi
	access=${SORA_ACCESS:-}
	if [[ -z $access ]]; then
		if [[ $can_prompt == 1 ]]; then
			say ""
			say "  How will you reach Sora?"
			say "    1) This computer only (http://localhost)"
			say "    2) Other devices on my home network (http://<this computer's address>)"
			say "    3) A domain name with HTTPS (needs ports 80 and 443 open to the internet)"
			while :; do
				ask "Choose 1, 2, or 3:" 1
				case $REPLY in
				1 | local) access=local ;;
				2 | lan) access=lan ;;
				3 | domain) access=domain ;;
				*) continue ;;
				esac
				break
			done
		else
			access=local
		fi
	fi
	case $access in
	local | lan)
		port=${SORA_PORT:-}
		if [[ -z $port && $can_prompt == 1 ]]; then
			ask "Port:" 8080
			port=$REPLY
		fi
		port=${port:-8080}
		if [[ ! $port =~ ^[0-9]+$ ]] || ((port < 1 || port > 65535)); then
			die "Port $port is not a valid port number."
		fi
		env_set COMPOSE_PROFILES http
		env_set SORA_PORT "$port"
		env_set SORA_DOMAIN ""
		if [[ $access == "local" ]]; then
			env_set SORA_BIND 127.0.0.1
		else
			env_set SORA_BIND 0.0.0.0
		fi
		;;
	domain)
		domain=${SORA_DOMAIN:-}
		while [[ -z $domain ]]; do
			[[ $can_prompt == 1 ]] || missing_answer SORA_DOMAIN "The domain name"
			ask "Domain name (such as sora.example.com):"
			domain=$REPLY
		done
		domain=$(printf '%s' "$domain" | tr '[:upper:]' '[:lower:]')
		domain=${domain#https://}
		domain=${domain#http://}
		domain=${domain%/}
		[[ $domain =~ $domain_pattern ]] || die "$domain is not a domain name."
		env_set COMPOSE_PROFILES https
		env_set SORA_DOMAIN "$domain"
		env_set SORA_BIND ""
		env_set SORA_PORT ""
		;;
	*) die "SORA_ACCESS must be local, lan, or domain, not $access." ;;
	esac
	ok "Access: $(access_label)"
}

# The access mode .env describes: local, lan, or domain.
access_mode() {
	if [[ $(env_get COMPOSE_PROFILES) == "https" ]]; then
		printf 'domain'
	elif [[ $(env_get SORA_BIND) == "0.0.0.0" ]]; then
		printf 'lan'
	else
		printf 'local'
	fi
}

access_label() {
	if [[ $(env_get COMPOSE_PROFILES) == "https" ]]; then
		printf 'https://%s' "$(env_get SORA_DOMAIN)"
	elif [[ $(env_get SORA_BIND) == "0.0.0.0" ]]; then
		printf 'home network, port %s' "$(env_get SORA_PORT)"
	else
		printf 'this computer, port %s' "$(env_get SORA_PORT)"
	fi
}

settle_dub_timing() {
	if env_has SORA_SCHEDULER_SUFFIX; then
		local current=no
		if [[ $(env_get SORA_SCHEDULER_SUFFIX) == "-full" ]]; then
			current=yes
		fi
		if [[ -n ${SORA_DUB_TIMING:-} && $(printf '%s' "$SORA_DUB_TIMING" | tr '[:upper:]' '[:lower:]') != "$current" ]]; then
			warn "SORA_DUB_TIMING=$SORA_DUB_TIMING is ignored: .env has dub timing $current. Set SORA_SCHEDULER_SUFFIX in $dir/.env to change it."
		fi
		return
	fi
	local answer=${SORA_DUB_TIMING:-}
	if [[ -z $answer && $can_prompt == 1 ]]; then
		say ""
		if ask_yes_no "Time dub subtitles to the dub's speech? Adds ~1.5 GB and minutes of CPU per dub." no; then
			answer=yes
		else
			answer=no
		fi
	fi
	case $(printf '%s' "${answer:-no}" | tr '[:upper:]' '[:lower:]') in
	y | yes | 1 | true) env_set SORA_SCHEDULER_SUFFIX "-full" ;;
	n | no | 0 | false) env_set SORA_SCHEDULER_SUFFIX "" ;;
	*) die "SORA_DUB_TIMING must be yes or no, not $answer." ;;
	esac
}

project_name() {
	basename "$dir" | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9_-]/-/g' -e 's/^[^a-z0-9]*//'
}

# ---------------------------------------------------------------------------
# Releases

# SORA_RELEASES_URL points at another copy of the releases, for testing.
releases_url() {
	printf '%s' "${SORA_RELEASES_URL:-$releases_url_default}"
}

resolve_release() {
	local tag=$requested_version
	if [[ -z $tag ]]; then
		local effective
		if ! effective=$(curl -fsSIL -o /dev/null -w '%{url_effective}' --max-time 30 "$(releases_url)/latest"); then
			die "Could not look up the newest release at $(releases_url)/latest. Check the network, or pass --version vX.Y.Z."
		fi
		tag=${effective##*/}
	fi
	if [[ $tag != v* ]]; then
		tag="v$tag"
	fi
	[[ $tag =~ $tag_pattern ]] || die "The release '$tag' is not a version like v1.2.3."
	release_tag=$tag
}

sha256_of() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | awk '{ print $1 }'
	else
		shasum -a 256 "$1" | awk '{ print $1 }'
	fi
}

verify_sha256() {
	local actual
	actual=$(sha256_of "$1")
	if [[ $actual != "$2" ]]; then
		die "$(basename "$1") does not match its checksum (expected $2, got $actual). Nothing was changed."
	fi
}

# Downloads compose.yaml and install.sh of the release and checks them
# against its SHA256SUMS.
download_release() {
	local base file expected protocols="=https"
	base="$(releases_url)/download/$release_tag"
	if [[ -n ${SORA_RELEASES_URL:-} ]]; then
		protocols="=https,http,file"
	fi
	for file in SHA256SUMS compose.yaml install.sh; do
		if ! curl -fsSL --retry 3 --max-time 60 --proto "$protocols" -o "$tmp_dir/$file" "$base/$file"; then
			die "Could not download $file of $release_tag from $base."
		fi
	done
	for file in compose.yaml install.sh; do
		expected=$(awk -v name="$file" '$2 == name || $2 == "*" name { print $1 }' "$tmp_dir/SHA256SUMS")
		[[ -n $expected ]] || die "SHA256SUMS of $release_tag does not list $file."
		verify_sha256 "$tmp_dir/$file" "$expected"
	done
	ok "Downloaded Sora $release_tag (checksums match)"
}

install_release_files() {
	run cp "$tmp_dir/compose.yaml" "$dir/compose.yaml.next"
	run mv "$dir/compose.yaml.next" "$dir/compose.yaml"
	run cp "$tmp_dir/install.sh" "$dir/sora.sh.next"
	run chmod 755 "$dir/sora.sh.next"
	run mv "$dir/sora.sh.next" "$dir/sora.sh"
}

# ---------------------------------------------------------------------------
# Stack

profiles_off() {
	if [[ $(env_get COMPOSE_PROFILES) == "https" ]]; then
		printf 'proxy'
	else
		printf 'proxy-https'
	fi
}

show_failure() {
	spinner_stop
	{
		printf '\n'
		"${compose_cmd[@]}" ps -a 2>&1 || :
	} | tee -a "$log_file" >&3
	local service state health exit_code
	while IFS=$'\t' read -r service state health exit_code; do
		[[ -n $service ]] || continue
		if [[ $state == "running" && ($health == "" || $health == "healthy") ]]; then
			continue
		fi
		if [[ $state == "exited" && $exit_code == 0 ]]; then
			continue
		fi
		{
			printf '\n--- %s (%s %s), last 50 lines ---\n' "$service" "$state" "$health"
			"${compose_cmd[@]}" logs --no-color --tail 50 "$service" 2>&1 || :
		} | tee -a "$log_file" >&3
	done < <("${compose_cmd[@]}" ps -a --format '{{.Service}}{{"\t"}}{{.State}}{{"\t"}}{{.Health}}{{"\t"}}{{.ExitCode}}' 2>/dev/null || :)
}

pull_images() {
	if [[ $dry_run == 1 ]]; then
		run "${compose_cmd[@]}" pull
		return
	fi
	say "  Pulling images (about 1.2 GB the first time$([[ $(env_get SORA_SCHEDULER_SUFFIX) == "-full" ]] && printf ', 2.7 GB with dub timing'))"
	printf '+ %s\n' "$(quote "${compose_cmd[@]}" pull)"
	if [[ $is_tty_out == 1 ]]; then
		if ! "${compose_cmd[@]}" pull >&3 2>&3; then
			die "Pulling images failed (shown above)."
		fi
	elif ! "${compose_cmd[@]}" --progress plain pull; then
		tail -n 10 "$log_file" | sed 's/^/    /' >&3
		die "Pulling images failed."
	fi
	ok "Images pulled"
}

start_stack() {
	local off
	off=$(profiles_off)
	if [[ $dry_run == 0 ]] && [[ -n $(COMPOSE_PROFILES=http,https "${compose_cmd[@]}" ps -aq "$off" 2>/dev/null) ]]; then
		COMPOSE_PROFILES=http,https run "${compose_cmd[@]}" rm -sf "$off"
	fi
	if [[ $dry_run == 1 ]]; then
		run "${compose_cmd[@]}" up -d --wait --wait-timeout 300 --remove-orphans
		return
	fi
	spinner_start "Starting Sora $release_tag (waits until every service is healthy)"
	printf '+ %s\n' "$(quote "${compose_cmd[@]}" up -d --wait --wait-timeout 300 --remove-orphans)"
	if ! "${compose_cmd[@]}" up -d --wait --wait-timeout 300 --remove-orphans; then
		show_failure
		if [[ -n $last_backup ]]; then
			say ""
			say "  The database was backed up to $last_backup first. To go back to v$previous_version:"
			say "  set SORA_VERSION=$previous_version in $dir/.env, restore the backup (README, \"Restore a"
			say "  backup\"), and run: cd $dir && docker compose up -d --wait"
		fi
		die "Sora did not start. The services and their logs are above."
	fi
	spinner_stop
	ok "Sora is running"
}

account_count() {
	"${compose_cmd[@]}" exec -T database psql -U sora -d sora -tAc "select count(*) from auth_user"
}

create_account() {
	if [[ $dry_run == 1 ]]; then
		run "${compose_cmd[@]}" exec -T api bun packages/core/src/auth/create-account.ts "<username>" --password-stdin
		return
	fi
	local count
	count=$(account_count | tr -d '[:space:]')
	if [[ $count != "0" ]]; then
		ok "An account exists already"
		return
	fi

	local username=${SORA_USERNAME:-} password=${SORA_PASSWORD:-} again
	if [[ -n $username && ! $username =~ $username_pattern ]]; then
		die "SORA_USERNAME must be 3–30 letters, digits, dots, or underscores."
	fi
	if [[ -z $username ]]; then
		[[ $can_prompt == 1 ]] || missing_answer SORA_USERNAME "A username for the first account"
		say ""
		say "  Create the first account. You sign in with it; it can hold several profiles."
		while :; do
			ask "Username (3–30 letters, digits, dots, underscores):"
			username=$REPLY
			[[ $username =~ $username_pattern ]] && break
			warn "That username won't work."
		done
	fi
	if [[ -n $password ]] && ((${#password} < 8 || ${#password} > 128)); then
		die "SORA_PASSWORD must be 8–128 characters."
	fi
	if [[ -z $password ]]; then
		[[ $can_prompt == 1 ]] || missing_answer SORA_PASSWORD "A password for the first account"
		while :; do
			ask_secret "Password (8–128 characters, hidden):"
			password=$REPLY
			if ((${#password} < 8 || ${#password} > 128)); then
				warn "The password must be 8–128 characters."
				continue
			fi
			ask_secret "Password again:"
			again=$REPLY
			if [[ $password != "$again" ]]; then
				warn "The passwords don't match."
				continue
			fi
			break
		done
	fi
	printf '+ %s\n' "$(quote "${compose_cmd[@]}" exec -T api bun packages/core/src/auth/create-account.ts "$username" --password-stdin)"
	if ! printf '%s\n' "$password" | "${compose_cmd[@]}" exec -T api bun packages/core/src/auth/create-account.ts "$username" --password-stdin; then
		die "Creating the account failed; see the log."
	fi
	ok "Created the account $username"
}

backup_database() {
	local stamp file
	stamp=$(date -u +%Y%m%dT%H%M%SZ)
	file="$dir/backups/sora-$stamp.dump"
	if [[ $dry_run == 1 ]]; then
		run mkdir -p "$dir/backups"
		run "${compose_cmd[@]}" exec -T database pg_dump -U sora -d sora -Fc ">" "$file"
		return
	fi
	if ! is_running database; then
		spinner_start "Starting the database for the backup"
		"${compose_cmd[@]}" up -d --wait database
		spinner_stop
	fi
	mkdir -p "$dir/backups"
	chmod 700 "$dir/backups"
	spinner_start "Backing up the database"
	partial_backup="$file.partial"
	printf '+ %s > %s\n' "$(quote "${compose_cmd[@]}" exec -T database pg_dump -U sora -d sora -Fc)" "$partial_backup"
	(
		umask 077
		"${compose_cmd[@]}" exec -T database pg_dump -U sora -d sora -Fc >"$partial_backup"
	)
	mv "$partial_backup" "$file"
	partial_backup=""
	spinner_stop
	[[ -s $file ]] || die "The backup $file is empty."
	ok "Backed up the database to $file ($(du -h "$file" | awk '{ print $1 }'))"
	last_backup=$file
}

lan_address() {
	local address="" interface
	if [[ $os_name == "macOS" ]]; then
		interface=$(route -n get default 2>/dev/null | awk '/interface:/ { print $2 }' || :)
		address=$(ipconfig getifaddr "${interface:-en0}" 2>/dev/null || :)
	elif command -v ip >/dev/null 2>&1; then
		address=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit } }' || :)
	fi
	if [[ -z $address ]] && command -v hostname >/dev/null 2>&1; then
		address=$(hostname -I 2>/dev/null | awk '{ print $1 }' || :)
	fi
	printf '%s' "${address:-<this computer\'s address>}"
}

site_url() {
	if [[ $(env_get COMPOSE_PROFILES) == "https" ]]; then
		printf 'https://%s' "$(env_get SORA_DOMAIN)"
	elif [[ $(env_get SORA_BIND) == "0.0.0.0" ]]; then
		printf 'http://%s:%s' "$(lan_address)" "$(env_get SORA_PORT)"
	else
		printf 'http://localhost:%s' "$(env_get SORA_PORT)"
	fi
}

finish() {
	local url
	url=$(site_url)
	say ""
	say "$(paint 1 "Sora $release_tag is running at $(paint 4 "$url")")"
	say ""
	say "  The catalogue starts empty and fills in the background. What you open or"
	say "  search for is stored first and shows up within a few minutes. The search"
	say "  index is complete after about half an hour, and the rest of the catalogue"
	say "  fills over the next hours, most popular titles first."
	if [[ $is_wsl == 1 && $(env_get SORA_BIND) == "0.0.0.0" ]]; then
		say ""
		say "  On WSL2, other devices reach this only with mirrored networking or a port"
		say "  forward on Windows: https://learn.microsoft.com/windows/wsl/networking"
	fi
	say ""
	say "  Folder:     $dir"
	say "  Log:        $log_file"
	say "  Update:     $dir/sora.sh update"
	say "  Back up:    $dir/sora.sh backup"
	say "  Uninstall:  $dir/sora.sh uninstall"
	say "  Logs:       cd $dir && docker compose logs -f"
}

# ---------------------------------------------------------------------------
# Commands

prepare() {
	check_platform
	check_docker
	set_compose_cmd
	read_env
}

cmd_install() {
	prepare
	local is_new=1
	if [[ -f "$dir/.env" ]]; then
		is_new=0
		ok "Found an install in $dir; bringing it up to date"
	fi

	settle_key TMDB_READ_ACCESS_TOKEN SORA_TMDB_TOKEN "TMDB" \
		"TMDB: https://www.themoviedb.org/settings/api, copy the \"API Read Access Token\"." \
		"https://api.themoviedb.org/3/authentication"
	settle_key ANIME_SCHEDULE_API_KEY SORA_ANIME_SCHEDULE_KEY "AnimeSchedule" \
		"AnimeSchedule: https://animeschedule.net, Account settings, API applications, create one and copy its token." \
		"https://animeschedule.net/api/v3/timetables/sub?tz=UTC"
	settle_access
	settle_dub_timing
	if [[ -z $(env_get COMPOSE_PROJECT_NAME) ]]; then
		env_set COMPOSE_PROJECT_NAME "$(project_name)"
	fi
	# For testing unreleased images; not part of the documented interface.
	if [[ -n ${SORA_IMAGE_PREFIX:-} ]]; then
		env_set SORA_IMAGE_PREFIX "$SORA_IMAGE_PREFIX"
	fi
	ensure_secrets

	if [[ $(env_get COMPOSE_PROFILES) == "https" ]]; then
		check_domain_dns "$(env_get SORA_DOMAIN)"
	fi
	check_ports

	resolve_release
	download_release
	previous_version=$(env_get SORA_VERSION)
	if [[ $is_new == 0 && -n $previous_version && "v$previous_version" != "$release_tag" ]] && is_running database; then
		backup_database
	fi
	env_set SORA_VERSION "${release_tag#v}"

	if [[ $dry_run == 1 ]]; then
		run mkdir -p "$dir"
		say "  $(paint 2 "would write:") $dir/.env (values hidden)"
	else
		mkdir -p "$dir"
		write_env
	fi
	install_release_files
	pull_images
	start_stack
	create_account
	if [[ $dry_run == 1 ]]; then
		ok "Dry run complete; nothing was changed"
		return
	fi
	finish
}

cmd_update() {
	prepare
	[[ -f "$dir/.env" ]] || die "No Sora install in $dir. Install it first, or pass --dir."
	[[ -f "$dir/compose.yaml" ]] || die "$dir/compose.yaml is missing. Run the installer again to restore it."
	previous_version=$(env_get SORA_VERSION)
	resolve_release
	if [[ "v$previous_version" == "$release_tag" ]]; then
		ok "Already on $release_tag; re-applying it"
	else
		ok "Updating v$previous_version to $release_tag"
	fi
	download_release
	backup_database
	env_set SORA_VERSION "${release_tag#v}"
	if [[ $dry_run == 1 ]]; then
		say "  $(paint 2 "would set:") SORA_VERSION=${release_tag#v} in $dir/.env"
	else
		write_env
	fi
	install_release_files
	pull_images
	start_stack
	if [[ $dry_run == 1 ]]; then
		ok "Dry run complete; nothing was changed"
		return
	fi
	finish
}

cmd_backup() {
	prepare
	[[ -f "$dir/.env" && -f "$dir/compose.yaml" ]] || die "No Sora install in $dir. Pass --dir."
	backup_database
	if [[ $dry_run == 0 ]]; then
		say ""
		say "  To restore it:"
		say "    cd $dir"
		say "    docker compose stop api scheduler web"
		say "    docker compose exec -T database pg_restore -U sora -d sora --clean --if-exists < $last_backup"
		say "    docker compose up -d --wait"
	fi
}

cmd_uninstall() {
	prepare
	[[ -f "$dir/.env" && -f "$dir/compose.yaml" ]] || die "No Sora install in $dir. Pass --dir."
	local name confirm=${SORA_CONFIRM_REMOVE:-}
	name=$(basename "$dir")
	if [[ $dry_run == 0 ]]; then
		spinner_start "Stopping Sora"
	fi
	COMPOSE_PROFILES=http,https run "${compose_cmd[@]}" down
	spinner_stop
	ok "Stopped and removed Sora's containers"

	if [[ -z $confirm && $can_prompt == 1 ]]; then
		say ""
		say "  The database (your accounts, watchlists, and the catalogue) is kept."
		ask "To delete it as well, type the folder name ($name); to keep it, press Enter:"
		confirm=$REPLY
	fi
	if [[ -n $confirm && $confirm != "$name" ]]; then
		die "'$confirm' is not $name; the data was kept."
	fi
	if [[ $confirm == "$name" ]]; then
		COMPOSE_PROFILES=http,https run "${compose_cmd[@]}" down -v
		ok "Deleted the database and certificate volumes"
		say "  $dir still holds .env, logs, and backups; delete it yourself when you no longer need them."
	else
		say "  Data kept. Start Sora again with: $dir/sora.sh"
	fi
}

# ---------------------------------------------------------------------------

parse_args() {
	while (($# > 0)); do
		case $1 in
		install | update | backup | uninstall) command_name=$1 ;;
		--dir)
			(($# > 1)) || die_early "--dir needs a path."
			dir=$2
			shift
			;;
		--dir=*) dir=${1#--dir=} ;;
		--version)
			(($# > 1)) || die_early "--version needs a release, such as v1.2.3."
			requested_version=$2
			shift
			;;
		--version=*) requested_version=${1#--version=} ;;
		-y | --yes) assume_yes=1 ;;
		--dry-run) dry_run=1 ;;
		-h | --help)
			usage
			exit 0
			;;
		*) die_early "Unknown argument: $1 (see --help)" ;;
		esac
		shift
	done
}

die_early() {
	printf 'install.sh: %s\n' "$1" >&2
	exit 2
}

default_dir() {
	local script_dir=""
	if [[ -n ${SORA_DIR:-} ]]; then
		printf '%s' "$SORA_DIR"
		return
	fi
	if [[ -f ${BASH_SOURCE[0]:-} ]]; then
		script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
	fi
	if [[ -n $script_dir && -f "$script_dir/.env" && -f "$script_dir/compose.yaml" ]]; then
		printf '%s' "$script_dir"
	else
		printf '%s' "$HOME/sora"
	fi
}

absolute_dir() {
	local path=$1
	case $path in
	\~) path=$HOME ;;
	\~/*) path="$HOME/${path#\~/}" ;;
	esac
	if [[ $path != /* ]]; then
		path="$PWD/$path"
	fi
	printf '%s' "${path%/}"
}

main() {
	parse_args "$@"
	dir=$(absolute_dir "${dir:-$(default_dir)}")
	unset COMPOSE_FILE COMPOSE_PROFILES COMPOSE_PROJECT_NAME
	release_tag=""
	last_backup=""
	partial_backup=""
	previous_version=""
	env_line_key=""
	env_line_value=""
	setup_terminal
	tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/sora-install-XXXXXX")
	trap on_exit EXIT
	trap 'on_error $? $LINENO "$BASH_COMMAND"' ERR
	start_log
	if [[ $dry_run == 1 ]]; then
		say "$(paint 33 "Dry run:") nothing is changed; commands that would change something are printed."
		say ""
	fi
	case $command_name in
	install) cmd_install ;;
	update) cmd_update ;;
	backup) cmd_backup ;;
	uninstall) cmd_uninstall ;;
	esac
}

main "$@"
